import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

type LineIconName =
  | 'bookmark'
  | 'calendar'
  | 'check-square'
  | 'cpu'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'edit-3'
  | 'external-link'
  | 'file-text'
  | 'folder'
  | 'folder-plus'
  | 'grid'
  | 'heart'
  | 'home'
  | 'instagram'
  | 'link'
  | 'map'
  | 'map-pin'
  | 'message-circle'
  | 'more-horizontal'
  | 'navigation'
  | 'play'
  | 'plus'
  | 'search'
  | 'send'
  | 'sliders'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'tool'
  | 'trash-2'
  | 'trending-up'
  | 'type'
  | 'x';

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
    case 'check':
      return <Polyline {...stroke} points="5,12.5 10,17 19,7" />;
    case 'chevron-left':
      return <Polyline {...stroke} points="15,5 8,12 15,19" />;
    case 'chevron-right':
      return <Polyline {...stroke} points="9,5 16,12 9,19" />;
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
    case 'edit-3':
      return (
        <>
          <Path {...stroke} d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <Path {...stroke} d="M14.5 7.5 17.5 10.5" />
        </>
      );
    case 'external-link':
      return (
        <>
          <Path {...stroke} d="M14 4h6v6" />
          <Path {...stroke} d="M20 4 10 14" />
          <Path {...stroke} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
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
    case 'folder':
      return <Path {...stroke} d="M3.5 7.5h7l2 2h8v10h-17v-12Z" />;
    case 'folder-plus':
      return (
        <>
          <Path {...stroke} d="M3.5 7.5h7l2 2h8v10h-17v-12Z" />
          <Line {...stroke} x1={12} y1={12.5} x2={12} y2={17} />
          <Line {...stroke} x1={9.8} y1={14.75} x2={14.2} y2={14.75} />
        </>
      );
    case 'grid':
      return (
        <>
          <Rect {...stroke} x={4} y={4} width={7} height={7} rx={1.5} />
          <Rect {...stroke} x={13} y={4} width={7} height={7} rx={1.5} />
          <Rect {...stroke} x={4} y={13} width={7} height={7} rx={1.5} />
          <Rect {...stroke} x={13} y={13} width={7} height={7} rx={1.5} />
        </>
      );
    case 'heart':
      return <Path {...stroke} d="M12 20s-7-4.4-8.8-9.1C2.1 7.8 4 5 7 5c1.7 0 3.1.9 4 2.2C11.9 5.9 13.3 5 15 5c3 0 4.9 2.8 3.8 5.9C17 15.6 12 20 12 20Z" />;
    case 'home':
      return (
        <>
          <Path {...stroke} d="M4 11.5 12 4l8 7.5" />
          <Path {...stroke} d="M6.5 10.5V20h11v-9.5" />
          <Path {...stroke} d="M10 20v-5h4v5" />
        </>
      );
    case 'instagram':
      return (
        <>
          <Rect {...stroke} x={4} y={4} width={16} height={16} rx={4} />
          <Circle {...stroke} cx={12} cy={12} r={3.4} />
          <Circle fill={color} cx={16.8} cy={7.2} r={0.9} />
        </>
      );
    case 'link':
      return (
        <>
          <Path {...stroke} d="M10.5 13.5a4 4 0 0 0 5.6 0l2.4-2.4a4 4 0 0 0-5.6-5.6l-1.2 1.2" />
          <Path {...stroke} d="M13.5 10.5a4 4 0 0 0-5.6 0l-2.4 2.4a4 4 0 0 0 5.6 5.6l1.2-1.2" />
        </>
      );
    case 'map':
      return (
        <>
          <Path {...stroke} d="M4 6.5 9 4l6 2.5 5-2.5v13.5l-5 2.5-6-2.5-5 2.5V6.5Z" />
          <Line {...stroke} x1={9} y1={4} x2={9} y2={17.5} />
          <Line {...stroke} x1={15} y1={6.5} x2={15} y2={20} />
        </>
      );
    case 'map-pin':
      return (
        <>
          <Path {...stroke} d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
          <Circle {...stroke} cx={12} cy={10} r={2.2} />
        </>
      );
    case 'message-circle':
      return (
        <>
          <Path {...stroke} d="M20 11.5a7.7 7.7 0 0 1-8 7.5 8.6 8.6 0 0 1-3.8-.9L4 19l1.1-3.6A7.2 7.2 0 0 1 4 11.5 7.7 7.7 0 0 1 12 4a7.7 7.7 0 0 1 8 7.5Z" />
        </>
      );
    case 'more-horizontal':
      return (
        <>
          <Circle fill={color} cx={6} cy={12} r={1.5} />
          <Circle fill={color} cx={12} cy={12} r={1.5} />
          <Circle fill={color} cx={18} cy={12} r={1.5} />
        </>
      );
    case 'navigation':
    case 'send':
      return <Path {...stroke} d="M21 3 10.8 20.5 9 13 3 10.2 21 3Z" />;
    case 'play':
      return <Path {...stroke} fill={color} d="M8 5.5v13l10-6.5-10-6.5Z" />;
    case 'plus':
      return (
        <>
          <Line {...stroke} x1={12} y1={5} x2={12} y2={19} />
          <Line {...stroke} x1={5} y1={12} x2={19} y2={12} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...stroke} cx={10.5} cy={10.5} r={6.5} />
          <Line {...stroke} x1={15.5} y1={15.5} x2={20} y2={20} />
        </>
      );
    case 'sliders':
      return (
        <>
          <Line {...stroke} x1={4} y1={7} x2={20} y2={7} />
          <Line {...stroke} x1={4} y1={12} x2={20} y2={12} />
          <Line {...stroke} x1={4} y1={17} x2={20} y2={17} />
          <Circle {...stroke} fill="#fff" cx={9} cy={7} r={2} />
          <Circle {...stroke} fill="#fff" cx={15} cy={12} r={2} />
          <Circle {...stroke} fill="#fff" cx={11} cy={17} r={2} />
        </>
      );
    case 'thumbs-up':
      return <Path {...stroke} d="M8 20H4V10h4v10Zm0-10 4-7 1.2 1.2c.5.5.7 1.2.5 1.9L13 9h5.5c1.1 0 1.9 1 1.7 2.1l-1.2 6.5A3 3 0 0 1 16 20H8V10Z" />;
    case 'thumbs-down':
      return <Path {...stroke} d="M8 4H4v10h4V4Zm0 10 4 7 1.2-1.2c.5-.5.7-1.2.5-1.9L13 15h5.5c1.1 0 1.9-1 1.7-2.1L19 6.4A3 3 0 0 0 16 4H8v10Z" />;
    case 'tool':
      return (
        <>
          <Path {...stroke} d="M5.5 4.5h9l2 2-2 2h-9l-2-2 2-2Z" />
          <Path {...stroke} d="M10 8.5v10.2a2.3 2.3 0 0 0 4.6 0V8.5" />
          <Line {...stroke} x1={10} y1={15} x2={14.6} y2={15} />
        </>
      );
    case 'trash-2':
      return (
        <>
          <Path {...stroke} d="M5 7h14" />
          <Path {...stroke} d="M9 7V5h6v2" />
          <Path {...stroke} d="M7 7l1 14h8l1-14" />
          <Line {...stroke} x1={10} y1={11} x2={10} y2={17} />
          <Line {...stroke} x1={14} y1={11} x2={14} y2={17} />
        </>
      );
    case 'trending-up':
      return (
        <>
          <Polyline {...stroke} points="4,16 9,11 13,15 20,8" />
          <Polyline {...stroke} points="15,8 20,8 20,13" />
        </>
      );
    case 'type':
      return (
        <>
          <Line {...stroke} x1={5} y1={5} x2={19} y2={5} />
          <Line {...stroke} x1={12} y1={5} x2={12} y2={19} />
          <Line {...stroke} x1={9} y1={19} x2={15} y2={19} />
        </>
      );
    case 'x':
      return (
        <>
          <Line {...stroke} x1={6} y1={6} x2={18} y2={18} />
          <Line {...stroke} x1={18} y1={6} x2={6} y2={18} />
        </>
      );
    default:
      return null;
  }
}
