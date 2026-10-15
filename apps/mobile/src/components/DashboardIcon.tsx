import Svg, { Circle, Path } from 'react-native-svg';
import { themeColors } from './ui/gluestack-ui-provider/config';

type IconName = 'account' | 'refresh' | 'close' | 'chevron';

export function DashboardIcon({ name }: { name: IconName }) {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`rgb(${themeColors['--foreground'].replaceAll(' ', ', ')})`}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === 'account' && (
        <>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Path d="M20 7a9 9 0 0 0-15-1L2 9m0-6v6h6M4 17a9 9 0 0 0 15 1l3-3m0 6v-6h-6" />
        </>
      )}
      {name === 'close' && <Path d="m6 6 12 12M6 18 18 6" />}
      {name === 'chevron' && <Path d="m9 5 7 7-7 7" />}
    </Svg>
  );
}
