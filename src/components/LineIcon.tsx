import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

type LineIconName =
  | 'bookmark'
  | 'calendar'
  | 'check-square'
  | 'cpu'
  | 'file-text'
  | 'home'
  | 'message-circle'
  | 'tool'
  | 'trending-up';

type LineIconProps = {
  name: LineIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function LineIcon({ name, size = 24, color = '#111827', strokeWidth = 2 }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {renderIcon(name, color, strokeWidth)}
    </Svg>
  );
}

function commonProps(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };
}

function renderIcon(name: LineIconName, color: string, strokeWidth: number) {
  const stroke = commonProps(color, strokeWidth);

  switch (name) {
    case 'bookmark':
      return <Path {...stroke} d="M6 4.5C6 3.7 6.7 3 7.5 3h9c.8 0 1.5.7 1.5 1.5V21l-6-3.6L6 21V4.5Z" />;
    case 'calendar':
      return (
        <>
          <Rect {...stroke} x={4} y={5} width={16} height={15} rx={2.5} />
          <Line {...stroke} x1={8} y1={3} x2={8} y2={7} />
          <Line {...stroke} x1={16} y1={3} x2={16} y2={7} />
          <Line {...stroke} x1={4} y1={10} x2={20} y2={10} />
        </>
      );
    case 'check-square':
      return (
        <>
          <Rect {...stroke} x={4} y={4} width={16} height={16} rx={3} />
          <Polyline {...stroke} points="8.5,12.5 11,15 16,9" />
        </>
      );
    case 'cpu':
      return (
        <>
          <Rect {...stroke} x={8} y={8} width={8} height={8} rx={1.5} />
          <Rect {...stroke} x={4} y={4} width={16} height={16} rx={3} />
          <Line {...stroke} x1={9} y1={1.5} x2={9} y2={4} />
          <Line {...stroke} x1={15} y1={1.5} x2={15} y2={4} />
          <Line {...stroke} x1={9} y1={20} x2={9} y2={22.5} />
          <Line {...stroke} x1={15} y1={20} x2={15} y2={22.5} />
          <Line {...stroke} x1={1.5} y1={9} x2={4} y2={9} />
          <Line {...stroke} x1={1.5} y1={15} x2={4} y2={15} />
          <Line {...stroke} x1={20} y1={9} x2={22.5} y2={9} />
          <Line {...stroke} x1={20} y1={15} x2={22.5} y2={15} />
        </>
      );
    case 'file-text':
      return (
        <>
          <Path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <Path {...stroke} d="M14 3v5h4" />
          <Line {...stroke} x1={9} y1={12} x2={15} y2={12} />
          <Line {...stroke} x1={9} y1={16} x2={15} y2={16} />
        </>
      );
    case 'home':
      return (
        <>
          <Path {...stroke} d="M4 11.5 12 4l8 7.5" />
          <Path {...stroke} d="M6.5 10.5V20h11v-9.5" />
          <Path {...stroke} d="M10 20v-5h4v5" />
        </>
      );
    case 'message-circle':
      return (
        <>
          <Path {...stroke} d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.6 8.6 0 0 1-3.8-.9L4 19l1.1-3.6A7.2 7.2 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" />
        </>
      );
    case 'tool':
      return (
        <>
          <Path {...stroke} d="M15.7 5.3a4.5 4.5 0 0 0 3.1 5.6l-8.6 8.6a2.4 2.4 0 0 1-3.4-3.4l8.6-8.6a4.5 4.5 0 0 0-5.6-3.1" />
          <Circle {...stroke} cx={8.5} cy={17.5} r={0.8} />
        </>
      );
    case 'trending-up':
      return (
        <>
          <Polyline {...stroke} points="4,16 9,11 13,15 20,8" />
          <Polyline {...stroke} points="15,8 20,8 20,13" />
        </>
      );
    default:
      return null;
  }
}
