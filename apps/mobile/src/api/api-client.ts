import axios, { type AxiosInstance, type Method } from 'axios';
import type { z } from 'zod';
import {
  userProfileSchema,
  entitlementsSchema,
  subscriptionOverviewSchema,
  scoreHistorySchema,
  apiErrorSchema,
  appleConfigSchema,
  appleSyncOperationSchema,
  appleSyncStatusSchema,
  googleConfigSchema,
  googleSyncOperationSchema,
  googleSyncStatusSchema,
  type GoogleConfig,
  type GoogleSyncRequest,
  type GoogleSyncOperation,
  type GoogleSyncStatus,
  type UserProfile,
  type Entitlements,
  type SubscriptionOverview,
  type ScoreHistory,
  type AppleConfig,
  type AppleSyncRequest,
  type AppleSyncOperation,
  type AppleSyncStatus,
} from '@premiumpass/api-contracts';
import { startApiLog, type ApiRequestLog } from './api-logger';

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

        if (config.signal?.aborted) {
          throw new axios.CanceledError();
        }

        let token: string;
        try {
          token = await getAccessToken();
          if (!token.trim()) {
            throw new Error('No access token.');
          }
        } catch {
          // Do not expose SDK errors, which may contain authentication details.
          throw new ApiError(
            'Unable to restore your session. Sign out and sign in again.',
            'authentication_required',
          );
        }

        if (config.signal?.aborted) {
          throw new axios.CanceledError();
        }

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

  private async request<T>(
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

  private get<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ) {
    return this.request('GET', path, schema, options);
  }

  private post<T>(
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

  getSubscriptionOverview(
    options: RequestOptions = {},
  ): Promise<SubscriptionOverview> {
    return this.get(
      '/v1/me/subscriptions',
      subscriptionOverviewSchema,
      options,
    );
  }

  getScoreHistory(options: RequestOptions = {}): Promise<ScoreHistory> {
    return this.get('/v1/premium/score-history', scoreHistorySchema, options);
  }

  getProfile(options: RequestOptions = {}): Promise<UserProfile> {
    return this.get('/v1/me', userProfileSchema, options);
  }

  getGoogleConfig(options: RequestOptions = {}): Promise<GoogleConfig> {
    return this.get('/v1/billing/google/config', googleConfigSchema, options);
  }

  startGoogleSync(
    input: GoogleSyncRequest,
    options: RequestOptions = {},
  ): Promise<GoogleSyncOperation> {
    return this.post(
      '/v1/billing/google/sync',
      input,
      googleSyncOperationSchema,
      options,
    );
  }

  getGoogleSyncStatus(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<GoogleSyncStatus> {
    return this.get(
      `/v1/billing/google/sync/${encodeURIComponent(operationId)}`,
      googleSyncStatusSchema,
      options,
    );
  }

  getAppleConfig(options: RequestOptions = {}): Promise<AppleConfig> {
    return this.get('/v1/billing/apple/config', appleConfigSchema, options);
  }

  startAppleSync(
    input: AppleSyncRequest,
    options: RequestOptions = {},
  ): Promise<AppleSyncOperation> {
    return this.post(
      '/v1/billing/apple/sync',
      input,
      appleSyncOperationSchema,
      options,
    );
  }

  getAppleSyncStatus(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<AppleSyncStatus> {
    return this.get(
      `/v1/billing/apple/sync/${encodeURIComponent(operationId)}`,
      appleSyncStatusSchema,
      options,
    );
  }
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new ApiError('The request was cancelled.', 'cancelled');
  }

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
      const body = apiErrorSchema.safeParse(error.response?.data);
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
