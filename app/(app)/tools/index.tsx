import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const tools: { name: string; icon: keyof typeof Feather.glyphMap; route: string; desc: string }[] = [
  { name: '題材庫', icon: 'bookmark', route: '/(app)/idea/library', desc: '儲存同發掘創作題材' },
  { name: '工作板', icon: 'check-square', route: '/(app)/work', desc: '任務同製作進度' },
  { name: '日程', icon: 'calendar', route: '/(app)/schedule', desc: '拍攝日程同截止日' },
  { name: '回覆中心', icon: 'message-circle', route: '/(app)/reply-centre', desc: 'AI 幫你覆 fans 同客' },
  { name: '劇本生成', icon: 'file-text', route: '/(app)/idea/library', desc: '由題材一鍵生成劇本' },
  { name: 'Mayan AI', icon: 'cpu', route: '/(app)/mayan', desc: '你的 AI 創作助手' },
];

export default function ToolsScreen() {
  return (
    <View style={styles.screen}>
      <BackHeader title="工具箱" />
      <ScrollView contentContainerStyle={styles.grid}>
        {tools.map((tool) => (
          <Pressable
            key={tool.name}
            onPress={() => router.push(tool.route as never)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Feather name={tool.icon} size={28} color={colors.primary} />
            <Text style={styles.name}>{tool.name}</Text>
            <Text style={styles.desc}>{tool.desc}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  grid: {
    padding: 16,
    paddingBottom: 110,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 16
  },
  name: {
    marginTop: 8,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  desc: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17
  },
  pressed: {
    opacity: 0.72
  }
});
