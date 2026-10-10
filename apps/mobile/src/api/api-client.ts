import axios, { type AxiosInstance, type Method } from 'axios';
import { z } from 'zod';
import { startApiLog, type ApiRequestLog } from './api-logger';

const userProfileSchema = z.object({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
});

const entitlementsSchema = z.object({
  tier: z.enum(['free', 'premium']),
  features: z.array(z.literal('score_history')),
  effectiveUntil: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime(),
  grants: z.array(
    z.object({
      provider: z.enum(['stripe', 'apple_mock', 'google_mock']),
      providerSubscriptionId: z.string(),
      revision: z.number().int().positive(),
      validUntil: z.iso.datetime(),
    }),
  ),
  warnings: z.array(
    z.object({
      provider: z.string(),
      providerSubscriptionId: z.string(),
      reason: z.string(),
    }),
  ),
});
const scoreHistorySchema = z.object({
  synthetic: z.literal(true),
  points: z.array(
    z.object({ date: z.iso.date(), score: z.number().min(0).max(100) }),
  ),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;
export type ScoreHistory = z.infer<typeof scoreHistorySchema>;

export type UserProfile = z.infer<typeof userProfileSchema>;
export type AccessTokenProvider = () => Promise<string>;

export interface RequestOptions {
  signal?: AbortSignal;
  params?: Record<string, string | number | boolean>;
}

type ApiErrorCode =
  | 'authentication_required'
  | 'premium_required'
  | 'forbidden'
  | 'cancelled'
  | 'timeout'
  | 'network_error'
  | 'http_error'
  | 'invalid_response'
  | 'invalid_request';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private readonly http: AxiosInstance;
  private readonly logs = new WeakMap<object, ApiRequestLog>();

  constructor(baseUrl: string, getAccessToken: AccessTokenProvider) {
    const origin = new URL(baseUrl).origin;
    this.http = axios.create({
      baseURL: origin,
      timeout: 15_000,
      headers: { Accept: 'application/json' },
    });

    this.http.interceptors.request.use(async (config) => {
      const log = startApiLog(
        config.method ?? 'GET',
        this.http.getUri({ ...config, params: undefined }),
        config.params,
        config.data,
      );
      this.logs.set(config, log);
      try {
        // Never attach credentials to a different API origin.
        const destination = new URL(this.http.getUri(config), origin);
        if (
          destination.origin !== origin ||
          destination.username ||
          destination.password
        ) {
          throw new ApiError(
            'The request must target the configured API.',
            'invalid_request',
          );
        }
        if (config.signal?.aborted) throw new axios.CanceledError();
        let token: string;
        try {
          token = await getAccessToken();
          if (!token.trim()) throw new Error('No access token.');
        } catch {
          // Do not expose SDK errors, which may contain authentication details.
          throw new ApiError(
            'Unable to restore your session. Sign out and sign in again.',
            'authentication_required',
          );
        }
        if (config.signal?.aborted) throw new axios.CanceledError();
        config.headers.set('Authorization', `Bearer ${token}`);
        return config;
      } catch (error) {
        const failure = normalizeError(error);
        log.error(failure);
        throw failure;
      }
    });

    this.http.interceptors.response.use(
      (response) => {
        this.logs
          .get(response.config)
          ?.response(
            response.status,
            response.data,
            response.headers['x-request-id'],
          );
        return response;
      },
      (error: unknown) => {
        const failure = normalizeError(error);
        if (axios.isAxiosError(error) && error.config) {
          this.logs.get(error.config)?.error(failure, error.response?.data);
        }
        // Axios errors contain request headers. Expose only our safe error shape.
        throw failure;
      },
    );
  }

  async request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions & { data?: unknown } = {},
  ): Promise<T> {
    const response = await this.http.request<unknown>({
      ...options,
      method,
      url: path,
    });
    const result = await schema.safeParseAsync(response.data);
    if (!result.success) {
      const failure = new ApiError(
        'The backend returned an unexpected response.',
        'invalid_response',
        response.status,
      );
      this.logs.get(response.config)?.error(failure);
      throw failure;
    }
    return result.data;
  }

  get<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}) {
    return this.request('GET', path, schema, options);
  }

  post<T>(
    path: string,
    data: unknown,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ) {
    return this.request('POST', path, schema, { ...options, data });
  }

  getEntitlements(options: RequestOptions = {}): Promise<Entitlements> {
    return this.get('/v1/me/entitlements', entitlementsSchema, options);
  }

  getScoreHistory(options: RequestOptions = {}): Promise<ScoreHistory> {
    return this.get('/v1/premium/score-history', scoreHistorySchema, options);
  }

  getProfile(options: RequestOptions = {}): Promise<UserProfile> {
    return this.get('/v1/me', userProfileSchema, options);
  }
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error))
    return new ApiError('The request was cancelled.', 'cancelled');
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError(
        'The request timed out. Check the backend and retry.',
        'timeout',
      );
    }
    if (status === 401) {
      return new ApiError(
        'The backend rejected this session. Sign out and sign in again.',
        'authentication_required',
        status,
      );
    }
    if (status === 403) {
      const body = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(error.response?.data);
      if (body.success && body.data.error.code === 'premium_required') {
        return new ApiError(
          'Premium access is required. Reload your status after changing the local scenario.',
          'premium_required',
          status,
        );
      }
      return new ApiError(
        'Access was denied. Check the required Auth0 API permissions.',
        'forbidden',
        status,
      );
    }
    if (status) {
      return new ApiError(
        'The backend could not complete the request. Check the backend and DynamoDB, then retry.',
        'http_error',
        status,
      );
    }
  }
  return new ApiError(
    'Cannot reach the backend. Check pnpm dev and the API URL, then retry.',
    'network_error',
  );
}
