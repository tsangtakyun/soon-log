import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { supabase } from '@/lib/supabase';

const IDEA_BOARDS_KEY = 'soonlogIdeaBoards';

type IdeaBoardsNativeModule = {
  getBoards?: () => Promise<string[]>;
  setBoards?: (boards: string[]) => Promise<string[]>;
};

const nativeIdeaBoards = NativeModules.IdeaBoardsModule as IdeaBoardsNativeModule | undefined;

function normalizeBoards(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0 && item !== 'Recents');
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];

    try {
      return normalizeBoards(JSON.parse(text));
    } catch {
      return text
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item !== 'Recents');
    }
  }

  return [];
}

function uniqueBoards(boards: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  boards.forEach((board) => {
    if (!seen.has(board)) {
      seen.add(board);
      result.push(board);
    }
  });

  return result;
}

async function loadNativeIdeaBoards() {
  try {
    return normalizeBoards(await nativeIdeaBoards?.getBoards?.());
  } catch (error) {
    console.warn('[idea-boards] native board load failed', error);
    return [];
  }
}

export async function loadLocalIdeaBoards() {
  const [stored, nativeBoards] = await Promise.all([
    AsyncStorage.getItem(IDEA_BOARDS_KEY),
    loadNativeIdeaBoards(),
  ]);

  const boards = uniqueBoards([...normalizeBoards(stored), ...nativeBoards]).sort((a, b) =>
    a.localeCompare(b)
  );

  if (nativeBoards.length > 0) {
    await AsyncStorage.setItem(IDEA_BOARDS_KEY, JSON.stringify(boards));
  }

  return boards;
}

export async function mergeLocalIdeaBoards(boards: unknown) {
  const existing = await loadLocalIdeaBoards();
  const merged = uniqueBoards([...existing, ...normalizeBoards(boards)]).sort((a, b) => a.localeCompare(b));
  await AsyncStorage.setItem(IDEA_BOARDS_KEY, JSON.stringify(merged));
  await nativeIdeaBoards?.setBoards?.(merged).catch((error) => {
    console.warn('[idea-boards] native board save failed', error);
  });
  return merged;
}

export async function saveLocalIdeaBoards(boards: unknown) {
  const nextBoards = uniqueBoards(normalizeBoards(boards)).sort((a, b) => a.localeCompare(b));
  await AsyncStorage.setItem(IDEA_BOARDS_KEY, JSON.stringify(nextBoards));
  await nativeIdeaBoards?.setBoards?.(nextBoards).catch((error) => {
    console.warn('[idea-boards] native board save failed', error);
  });
  return nextBoards;
}

export async function syncIdeaBoardsFromAccount(userId: string) {
  const { data, error } = await supabase
    .from('ideas')
    .select('categories')
    .eq('user_id', userId);

  if (error) throw error;

  const regionKeys = new Set(['HK', 'TW', 'JP', 'KR', 'US']);
  const accountBoards = (data ?? [])
    .flatMap((idea: { categories?: unknown }) => normalizeBoards(idea.categories))
    .filter((board) => !regionKeys.has(board));

  return mergeLocalIdeaBoards(accountBoards);
}
