import AsyncStorage from '@react-native-async-storage/async-storage';

const IDEA_BOARDS_KEY = 'soonlogIdeaBoards';

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

export async function loadLocalIdeaBoards() {
  const stored = await AsyncStorage.getItem(IDEA_BOARDS_KEY);
  return uniqueBoards(normalizeBoards(stored)).sort((a, b) => a.localeCompare(b));
}

export async function mergeLocalIdeaBoards(boards: unknown) {
  const existing = await loadLocalIdeaBoards();
  const merged = uniqueBoards([...existing, ...normalizeBoards(boards)]).sort((a, b) => a.localeCompare(b));
  await AsyncStorage.setItem(IDEA_BOARDS_KEY, JSON.stringify(merged));
  return merged;
}
