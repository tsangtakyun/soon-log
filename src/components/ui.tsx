import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function BodyText({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.accent}
      {...props}
      style={[styles.input, props.multiline && styles.multiline, props.style]}
    />
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'gold' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'gold' && styles.goldButton,
        variant === 'ghost' && styles.ghostButton,
        (pressed || disabled) && styles.pressed
      ]}
    >
      {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  title: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 40
  },
  body: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  muted: {
    color: colors.textMuted
  },
  input: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 14
  },
  multiline: {
    minHeight: 118,
    paddingTop: 14,
    textAlignVertical: 'top'
  },
  button: {
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  goldButton: {
    backgroundColor: colors.gold
  },
  ghostButton: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border
  },
  pressed: {
    opacity: 0.72
  },
  buttonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  empty: {
    padding: 24,
    gap: 8,
    alignItems: 'center'
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  emptyBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  }
});
