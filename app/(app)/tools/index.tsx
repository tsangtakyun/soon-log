import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { getCredits } from '@/lib/credits';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type ToolItem = {
  name: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  desc: string;
};

const creativeTools: ToolItem[] = [
  { name: '題材庫', icon: 'bookmark', route: '/(app)/tools/idea-library', desc: '儲存同發掘創作題材' },
  { name: '劇本創作', icon: 'file-text', route: '/(app)/tools/script-generator', desc: '由題材一鍵創作劇本' },
];

const adminTools: ToolItem[] = [
  { name: '工作板', icon: 'check-square', route: '/(app)/tools/work-board', desc: '任務同製作進度' },
  { name: '日程', icon: 'calendar', route: '/(app)/tools/schedule', desc: '拍攝日程同截止日' },
  { name: '回覆中心', icon: 'message-circle', route: '/(app)/tools/reply-centre', desc: 'AI 幫你覆 fans 同客' },
  { name: 'SOON AI', icon: 'cpu', route: '/(app)/tools/soon-ai', desc: '你的 AI 創作夥伴' },
];

export default function ToolsScreen() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const email = user?.email?.trim().toLowerCase() ?? '';

  const loadBalance = useCallback(async () => {
    if (!email) {
      setBalance(null);
      return;
    }

    try {
      setBalance(await getCredits(email));
    } catch {
      setBalance(null);
    }
  }, [email]);

  useFocusEffect(
    useCallback(() => {
      loadBalance();
    }, [loadBalance])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>工具箱</Text>
          <Text style={styles.subtitle}>所有創作工具</Text>
        </View>
        <View style={styles.creditWrap}>
          <Text style={[styles.creditText, (balance ?? 0) < 10 && styles.creditWarning]}>
            🪙 {balance ?? '...'} Credits
          </Text>
          {(balance ?? 10) < 10 ? <Text style={styles.creditWarningLabel}>Credits 不足</Text> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ToolSection title="創作中心" tools={creativeTools} />
        <ToolSection title="行政中心" tools={adminTools} />
      </ScrollView>
    </View>
  );
}

function ToolSection({
  title,
  tools
}: {
  title: string;
  tools: ToolItem[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  creditWrap: {
    alignItems: 'flex-end',
    gap: 3,
    paddingBottom: 1
  },
  creditText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700'
  },
  creditWarning: {
    color: '#b45309'
  },
  creditWarningLabel: {
    color: '#b45309',
    fontFamily: fonts.bodyMedium,
    fontSize: 11
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: '700',
  },
  grid: {
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
