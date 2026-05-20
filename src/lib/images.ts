import * as ImageManipulator from 'expo-image-manipulator';

export async function normalizeImageForUpload(uri: string, maxWidth = 1600) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG
    }
  );

  return {
    uri: result.uri,
    ext: 'jpg',
    contentType: 'image/jpeg'
  };
}
