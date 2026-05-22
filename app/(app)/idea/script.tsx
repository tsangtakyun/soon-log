import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ScriptSection = {
  label: string;
  emoji: string;
  color: string;
  value: string;
};

function getParam(value: string | string[] | undefined, fallback = '') {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

export default function IdeaScriptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hook?: string;
    background?: string;
    test?: string;
    ending?: string;
    title?: string;
  }>();

  const title = getParam(params.title, '題材劇本');
  const sections: ScriptSection[] = [
    { label: 'HOOK', emoji: '🎣', color: '#E8614A', value: getParam(params.hook) },
    { label: '背景', emoji: '📖', color: '#7c3aed', value: getParam(params.background) },
    { label: '主體', emoji: '🎬', color: '#5C2A22', value: getParam(params.test) },
    { label: '結尾', emoji: '🏁', color: '#34d399', value: getParam(params.ending) },
  ];

  const fullScript = `【Hook】\n${sections[0].value}\n\n【背景】\n${sections[1].value}\n\n【主體】\n${sections[2].value}\n\n【結尾】\n${sections[3].value}`;

  async function copyScript() {
    const clipboard = (globalThis.navigator as { clipboard?: { writeText: (text: string) => Promise<void> } } | undefined)?.clipboard;
    if (clipboard) {
      await clipboard.writeText(fullScript);
      Alert.alert('已複製', '劇本已複製到剪貼板');
      return;
    }

    await Share.share({ message: fullScript });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>🎬 Reel 劇本</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titlePill}>
          <Text style={styles.ideaTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section.label} style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Text style={styles.sectionEmoji}>{section.emoji}</Text>
              <Text style={[styles.sectionLabel, { color: section.color }]}>
                {section.label}
              </Text>
            </View>
            <Text style={styles.sectionContent}>{section.value || '未有內容'}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.copyButton} onPress={copyScript}>
          <Text style={styles.copyButtonText}>📋 複製劇本</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filmButton} onPress={() => router.replace('/(app)/log')}>
          <Text style={styles.filmButtonText}>🎬 開始拍攝</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: '#5C2A22',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 116,
  },
  titlePill: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    margin: 16,
  },
  ideaTitle: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  sectionEmoji: {
    fontSize: 15,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionContent: {
    color: '#1A1A1A',
    fontSize: 16,
    lineHeight: 26,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  copyButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5C2A22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonText: {
    color: '#5C2A22',
    fontSize: 15,
    fontWeight: '700',
  },
  filmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#5C2A22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filmButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
