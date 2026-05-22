import { View, StyleSheet } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { ReplyCenter } from '@/components/ReplyCenter';
import { colors } from '@/theme/colors';

export default function ReplyCentreScreen() {
  return (
    <View style={styles.screen}>
      <BackHeader title="回覆中心" />
      <ReplyCenter />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody,
  },
});
