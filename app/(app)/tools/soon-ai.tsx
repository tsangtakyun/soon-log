import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { generateAiText } from '@/lib/aiGenerate';
import { deductCredits, getCredits } from '@/lib/credits';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const SYSTEM_PROMPT = `你係 SOON AI，SOON-EGG Creator Network 嘅亞洲市場創作夥伴。

你係邊個：
你係專為亞洲 KOL 設計嘅 AI 助手，深度了解香港、台灣、新加坡、馬來西亞嘅內容創作文化。你唔係一個普通 chatbot——你係創作者嘅戰略夥伴，幫佢哋喺品牌合作、內容創作、同平台增長上做更好嘅決策。

你嘅性格：
- 親切但專業，唔會太正式
- 直接、有話直說，唔廢話
- 熟悉亞洲流行文化、社交媒體趨勢
- 識廣東話 / 繁中 / 英文，跟住用戶語言走
- 有創意、有主見，敢俾建議

你最叻嘅事：
1. 品牌合作策略 — 幫 KOL 寫邀請回覆、談判技巧、定價建議
2. 內容創作 — IG caption、YouTube 標題、小紅書文案、Hook 開場
3. 粉絲互動 — 回覆留言、DM 模板、提升互動率
4. 平台增長 — 分析賬號定位、內容方向建議、爆款題材
5. 亞洲市場洞察 — HK / TW / SG / MY / CN 市場差異、趨勢分析

回答風格：
- 預設用繁體中文（香港廣東話風格）
- 如果用戶用英文問就用英文答
- 短回答唔需要 bullet points，直接講
- 長回答用清晰結構，加實例
- 唔需要 disclaimer 或者過度謙虛

你唔做嘅事：
- 唔會幫用戶欺騙品牌或粉絲
- 唔會生成虛假數據或造假 stats
- 唔會建議違反各平台 TOS 嘅行為`;

const QUICK_PROMPTS = [
  '幫我寫一個 IG caption',
  '點樣提升我嘅互動率？',
  '推薦我應該接咩類型品牌',
  '幫我優化 Media Kit 吸引更多品牌',
  '點樣定 IG Reel 收費？'
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function SoonAiScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const canSend = inputText.trim().length > 0 && !isLoading && creditBalance !== 0;

  const conversationHistory = useMemo<AnthropicMessage[]>(() => {
    return messages
      .slice(-20)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));
  }, [messages]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [isLoading, messages.length]);

  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) {
      setCreditBalance(null);
      return;
    }

    getCredits(email)
      .then(setCreditBalance)
      .catch(() => setCreditBalance(null));
  }, [user?.email]);

  const refreshCreditBalance = useCallback(async () => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;
    try {
      setCreditBalance(await getCredits(email));
    } catch {
      // Credit display should not block the chat flow.
    }
  }, [user?.email]);

  const appendNoCreditsMessage = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-credits`,
        role: 'assistant',
        content: 'Credits 已用完 🪙\n請到 egg.sooncreator.network 購買更多 Credits',
        timestamp: new Date()
      }
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    if (messages.length === 0 || isLoading) return;
    Alert.alert('清除對話？', '呢個動作會清空今次對話內容。', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => setMessages([]) }
    ]);
  }, [isLoading, messages.length]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;
    if (creditBalance === 0) {
      appendNoCreditsMessage();
      return;
    }
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: new Date()
    };

    const nextUserMessage: AnthropicMessage = { role: 'user', content };
    const history: AnthropicMessage[] = [...conversationHistory, nextUserMessage].slice(-20);
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const email = user?.email?.trim().toLowerCase();
      if (email) {
        const creditResult = await deductCredits(email, 'ai_generate');
        setCreditBalance(creditResult.balance);

        if (!creditResult.success && creditResult.error === 'insufficient_credits') {
          appendNoCreditsMessage();
          return;
        }
      }

      const aiText = await generateAiText({
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1400,
        system: SYSTEM_PROMPT,
        messages: history
      });

	      setMessages((prev) => [
	        ...prev,
	        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: aiText,
          timestamp: new Date()
	        }
	      ]);
      await refreshCreditBalance();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試。';
      Alert.alert('發送失敗', message);
    } finally {
      setIsLoading(false);
    }
  }, [appendNoCreditsMessage, conversationHistory, creditBalance, inputText, isLoading, refreshCreditBalance, user?.email]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.replace('/(app)/tools' as never)} style={styles.backButton}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>SOON AI</Text>
          <Text style={styles.subtitle}>你的 AI 創作夥伴</Text>
          <Text style={[styles.creditText, (creditBalance ?? 10) < 10 && styles.creditWarning]}>
            🪙 {creditBalance ?? '...'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={clearMessages}
          disabled={messages.length === 0 || isLoading}
          style={[styles.clearButton, (messages.length === 0 || isLoading) && styles.disabledButton]}
        >
          <Feather name="trash-2" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={[
          styles.chatContent,
          messages.length === 0 && styles.emptyChatContent
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyAvatar}>
              <Text style={styles.emptyAvatarText}>S</Text>
            </View>
            <Text style={styles.emptyTitle}>有咩創作問題，問我。</Text>
            <Text style={styles.emptySubtitle}>
              品牌合作、內容方向、Caption、報價、Media Kit，SOON AI 都可以同你一齊諗。
            </Text>
            <QuickPromptChips onSelect={sendMessage} />
          </View>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {isLoading ? <TypingBubble /> : null}
      </ScrollView>

      <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {creditBalance === 0 ? <Text style={styles.noCreditsText}>Credits 用完了，請到 egg.sooncreator.network 購買</Text> : null}
        {messages.length > 0 ? <QuickPromptChips onSelect={sendMessage} compact /> : null}
        <View style={styles.inputBar}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="問 SOON AI 任何創作問題..."
            placeholderTextColor="#9ca3af"
            style={styles.input}
            multiline
            editable={!isLoading}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={() => sendMessage()}
            disabled={!canSend}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Feather name="arrow-up" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function QuickPromptChips({ onSelect, compact = false }: { onSelect: (prompt: string) => void; compact?: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.quickChipsScroller}
      contentContainerStyle={[styles.quickChips, compact && styles.quickChipsCompact]}
      keyboardShouldPersistTaps="handled"
    >
      {QUICK_PROMPTS.map((prompt) => (
        <Pressable key={prompt} onPress={() => onSelect(prompt)} style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
          <Text style={styles.quickChipText}>{prompt}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
      {!isUser ? (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>S</Text>
        </View>
      ) : null}
      <View style={[styles.messageGroup, isUser ? styles.userGroup : styles.aiGroup]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.aiMessageText]}>{message.content}</Text>
        </View>
        <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>{formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.messageRow, styles.aiRow]}>
      <View style={styles.aiAvatar}>
        <Text style={styles.aiAvatarText}>S</Text>
      </View>
      <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
        <TypingDots />
      </View>
    </View>
  );
}

function TypingDots() {
  const dots = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 260,
            useNativeDriver: true
          })
        ])
      )
    );
    Animated.parallel(animations).start();
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.dots}>
      {dots.map((opacity, index) => (
        <Animated.View key={index} style={[styles.dot, { opacity }]} />
      ))}
    </View>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
    backgroundColor: colors.bgBody
  },
  backButton: {
    width: 72,
    flexDirection: 'row',
    alignItems: 'center'
  },
  backText: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  headerText: {
    flex: 1,
    alignItems: 'center'
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  creditText: {
    marginTop: 4,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  creditWarning: {
    color: '#b45309'
  },
  clearButton: {
    width: 72,
    alignItems: 'flex-end',
    paddingVertical: 8
  },
  disabledButton: {
    opacity: 0.35
  },
  chat: {
    flex: 1
  },
  chatContent: {
    padding: 16,
    paddingBottom: 18,
    gap: 14
  },
  emptyChatContent: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 10
  },
  emptyAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  emptyAvatarText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    fontWeight: '800'
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center'
  },
  emptySubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center'
  },
  quickChips: {
    paddingTop: 18,
    paddingHorizontal: 32,
    paddingRight: 48,
    gap: 8
  },
  quickChipsScroller: {
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginHorizontal: -16
  },
  quickChipsCompact: {
    paddingTop: 0,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingRight: 28
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bgBodyCard,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  quickChipText: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.72
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '100%'
  },
  userRow: {
    justifyContent: 'flex-end'
  },
  aiRow: {
    justifyContent: 'flex-start'
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 18
  },
  aiAvatarText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '800'
  },
  messageGroup: {
    maxWidth: '78%'
  },
  userGroup: {
    alignItems: 'flex-end'
  },
  aiGroup: {
    alignItems: 'flex-start'
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  userBubble: {
    backgroundColor: '#8B1A1A',
    borderBottomRightRadius: 6
  },
  aiBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  messageText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  userMessageText: {
    color: '#ffffff'
  },
  aiMessageText: {
    color: colors.text
  },
  timestamp: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 10
  },
  userTimestamp: {
    color: colors.textMuted,
    marginRight: 4
  },
  aiTimestamp: {
    color: colors.textMuted,
    marginLeft: 4
  },
  typingBubble: {
    width: 58,
    paddingVertical: 13
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  noCreditsText: {
    marginBottom: 8,
    color: '#b45309',
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center'
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    paddingLeft: 15,
    paddingRight: 6,
    paddingVertical: 6
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 7,
    paddingBottom: 7
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d5db'
  }
});
