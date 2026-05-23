import { Platform } from 'react-native';

const rounded = Platform.OS === 'ios' ? 'SF Pro Rounded' : 'sans-serif';

export const fonts = {
  rounded,
  display: 'DMSerifDisplay_400Regular',
  heading: 'DMSerifDisplay_400Regular',
  body: Platform.OS === 'ios' ? rounded : 'DMSans_400Regular',
  bodyMedium: Platform.OS === 'ios' ? rounded : 'DMSans_500Medium',
  bodyBold: Platform.OS === 'ios' ? rounded : 'DMSans_700Bold',
};
