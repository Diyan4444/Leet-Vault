// Supported LeetCode programming languages mapped to file extensions and display names

export interface LanguageConfig {
  id: string;
  name: string;
  extension: string;
  aliases: string[];
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  cpp: {
    id: 'cpp',
    name: 'C++',
    extension: '.cpp',
    aliases: ['c++', 'cpp', 'clang++'],
  },
  c: {
    id: 'c',
    name: 'C',
    extension: '.c',
    aliases: ['c', 'clang'],
  },
  java: {
    id: 'java',
    name: 'Java',
    extension: '.java',
    aliases: ['java'],
  },
  python: {
    id: 'python',
    name: 'Python',
    extension: '.py',
    aliases: ['python', 'python3', 'py'],
  },
  python3: {
    id: 'python3',
    name: 'Python3',
    extension: '.py',
    aliases: ['python3', 'py3'],
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    aliases: ['javascript', 'js', 'node'],
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extension: '.ts',
    aliases: ['typescript', 'ts'],
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    extension: '.cs',
    aliases: ['c#', 'csharp', 'cs'],
  },
  go: {
    id: 'go',
    name: 'Go',
    extension: '.go',
    aliases: ['go', 'golang'],
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extension: '.rs',
    aliases: ['rust', 'rs'],
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extension: '.kt',
    aliases: ['kotlin', 'kt'],
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    extension: '.swift',
    aliases: ['swift'],
  },
  php: {
    id: 'php',
    name: 'PHP',
    extension: '.php',
    aliases: ['php'],
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    extension: '.rb',
    aliases: ['ruby', 'rb'],
  },
  scala: {
    id: 'scala',
    name: 'Scala',
    extension: '.scala',
    aliases: ['scala'],
  },
  dart: {
    id: 'dart',
    name: 'Dart',
    extension: '.dart',
    aliases: ['dart'],
  },
  r: {
    id: 'r',
    name: 'R',
    extension: '.r',
    aliases: ['r'],
  },
  sql: {
    id: 'sql',
    name: 'MySQL',
    extension: '.sql',
    aliases: ['mysql', 'sql', 'mssql', 'oraclesql', 'postgresql'],
  },
  bash: {
    id: 'bash',
    name: 'Bash',
    extension: '.sh',
    aliases: ['bash', 'sh', 'shell'],
  },
};

/**
 * Resolves a language string (from LeetCode dropdown or submission) to a normalized LanguageConfig
 */
export function resolveLanguage(langInput: string): LanguageConfig {
  const normalized = langInput.trim().toLowerCase();

  // Direct lookup
  if (SUPPORTED_LANGUAGES[normalized]) {
    return SUPPORTED_LANGUAGES[normalized];
  }

  // Alias lookup
  for (const config of Object.values(SUPPORTED_LANGUAGES)) {
    if (config.aliases.includes(normalized) || config.name.toLowerCase() === normalized) {
      return config;
    }
  }

  // Fallback for custom or unknown languages
  const safeExt = normalized.replace(/[^a-z0-9]/g, '');
  return {
    id: safeExt || 'txt',
    name: langInput.trim(),
    extension: safeExt ? `.${safeExt}` : '.txt',
    aliases: [normalized],
  };
}
