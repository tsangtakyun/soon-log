import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { useAuth } from '@/hooks/useAuth';
import { MayanMessageRole } from '@/types';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

const SYSTEM_PROMPT = `你係 Mayan，SOON Creator Network 嘅 AI 創作助手。
你專門幫助亞洲創作者（香港、台灣、新加坡）規劃內容、
分析題材、撰寫腳本同優化創作策略。
你用廣東話回覆，語氣友善、專業、有創意。
你了解 KOL 生態、短片製作、社交媒體算法同亞洲流行文化。`;

const quickActions = [
  '💡 幫我諗題材',
  '📝 幫我寫腳本',
  '📊 分析我嘅內容策略'
];

type ChatMessage = {
  id: string;
  user_id?: string;
  role: MayanMessageRole;
  content: string;
  created_at: string;
  isWelcome?: boolean;
};

type AnthropicTextBlock = {
  type?: string;
  text?: string;
};

export default function MayanScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);
  const showQuickActions = messages.length === 1 && messages[0]?.isWelcome;

  const loadMessages = useCallback(async () => {
    if (!user) return;
    setInitializing(true);

    const { data, error } = await supabase
      .from('mayan_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Mayan history error:', JSON.stringify(error));
      Alert.alert('載入失敗', error.message);
      setInitializing(false);
      return;
    }

    if (!data || data.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: '你好！我係 Mayan 👋\n我係你嘅 AI 創作助手，專門幫你規劃內容、分析題材同優化創作策略。\n\n有咩可以幫到你？',
        created_at: new Date().toISOString(),
        isWelcome: true
      }]);
    } else {
      setMessages(data as ChatMessage[]);
    }

    setInitializing(false);
  }, [user]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function sendMessage(textOverride?: string) {
    const userText = (textOverride ?? inputText).trim();
    if (!userText || !user || loading) return;

    if (!ANTHROPIC_KEY) {
      Alert.alert('未設定 Mayan', '請先喺 .env.local 填入 EXPO_PUBLIC_ANTHROPIC_KEY。');
      return;
    }

    const baseMessages = messages.filter((message) => !message.isWelcome);
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      user_id: user.id,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString()
    };

    setMessages([...baseMessages, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const { error: saveUserError } = await supabase.from('mayan_messages').insert({
        user_id: user.id,
        role: 'user',
        content: userText
      });

      if (saveUserError) throw saveUserError;

      const history = baseMessages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [...history, { role: 'user', content: userText }]
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? 'Mayan 暫時未能回覆，請稍後再試。');
      }

      const assistantText = data?.content
        ?.map((block: AnthropicTextBlock) => block.text)
        .filter(Boolean)
        .join('\n\n') ?? '';

      if (!assistantText) throw new Error('Mayan 回覆格式不正確，請稍後再試。');

      const { error: saveAssistantError } = await supabase.from('mayan_messages').insert({
        user_id: user.id,
        role: 'assistant',
        content: assistantText
      });

      if (saveAssistantError) throw saveAssistantError;

      const assistantMessage: ChatMessage = {
        id: `local-assistant-${Date.now()}`,
        user_id: user.id,
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString()
      };

      setMessages((prev) => [...prev.filter((message) => !message.isWelcome), assistantMessage]);
    } catch (err: any) {
      console.error('Mayan send error:', err);
      Alert.alert('Mayan 回覆失敗', err?.message ?? '請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
          {item.isWelcome && showQuickActions && (
            <View style={styles.quickActions}>
              {quickActions.map((action) => (
                <Pressable
                  key={action}
                  style={styles.quickChip}
                  onPress={() => sendMessage(action)}
                  disabled={loading}
                >
                  <Text style={styles.quickChipText}>{action}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.title}>◎ Mayan</Text>
          <Text style={styles.subtitle}>你嘅 AI 創作助手</Text>
        </View>

        {initializing ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={displayMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {loading && (
          <View style={styles.thinkingRow}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarTextSmall}>M</Text>
            </View>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.thinkingText}>Mayan 諗緊...</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="問 Mayan..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.input}
          />
          <Pressable
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!inputText.trim() || loading}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: colors.text
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted
  },
  loadingPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-end'
  },
  userRow: {
    justifyContent: 'flex-end'
  },
  assistantRow: {
    justifyContent: 'flex-start'
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: colors.gold
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.bgCard
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  userBubble: {
    backgroundColor: colors.text,
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    backgroundColor: colors.bgCard,
    borderBottomLeftRadius: 4
  },
  messageText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  userText: {
    color: colors.bgCard
  },
  assistantText: {
    color: colors.text
  },
  quickActions: {
    marginTop: 12,
    gap: 8
  },
  quickChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bgMuted
  },
  quickChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 8
  },
  avatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  avatarTextSmall: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.bgCard
  },
  thinkingText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  sendButtonDisabled: {
    opacity: 0.45
  },
  sendButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    lineHeight: 26,
    color: colors.bgCard
  }
});
