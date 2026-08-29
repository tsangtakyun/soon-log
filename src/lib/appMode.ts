export const isEggCreatorBuild =
  process.env.EXPO_PUBLIC_EGG_CREATOR_BUILD === 'true' ||
  process.env.EXPO_PUBLIC_APP_SCHEME === 'soonegg';
