export interface PasswordStrength {
  score: number; // 0-100
  level: 'very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong';
  label: string;
  color: string;
  entropy: number;
  crackTime: string;
  feedback: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
  'ashley', 'michael', 'shadow', '123123', '654321', 'superman', 'qazwsx',
  'football', 'passw0rd', 'hello', 'charlie', 'donald', 'login', 'princess',
  'starwars', 'solo', 'pass', 'flower', 'hottie', 'loveme', 'zaq1zaq1',
]);

const SEQUENTIAL_PATTERNS = [
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  '01234567890',
  '09876543210',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function calculateCharsetSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33;
  return size;
}

function calculateEntropy(password: string): number {
  const charsetSize = calculateCharsetSize(password);
  if (charsetSize === 0) return 0;
  return Math.floor(password.length * Math.log2(charsetSize));
}

function estimateCrackTime(entropy: number): string {
  // Assume 10 billion guesses/second (modern GPU cluster)
  const guessesPerSecond = 1e10;
  const totalGuesses = Math.pow(2, entropy);
  const seconds = totalGuesses / guessesPerSecond / 2; // Average case

  if (seconds < 1) return 'instantly';
  if (seconds < 60) return `${Math.floor(seconds)} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / 86400)} days`;
  if (seconds < 86400 * 365 * 1000) return `${Math.floor(seconds / (86400 * 365))} years`;
  if (seconds < 86400 * 365 * 1e6) return `${Math.floor(seconds / (86400 * 365 * 1000))}k years`;
  if (seconds < 86400 * 365 * 1e9) return `${Math.floor(seconds / (86400 * 365 * 1e6))}M years`;
  return `${Math.floor(seconds / (86400 * 365 * 1e9))}B+ years`;
}

function hasSequentialChars(password: string): boolean {
  const lower = password.toLowerCase();
  for (const pattern of SEQUENTIAL_PATTERNS) {
    for (let i = 0; i <= pattern.length - 3; i++) {
      if (lower.includes(pattern.slice(i, i + 3))) return true;
    }
  }
  return false;
}

function hasRepeatingChars(password: string): boolean {
  return /(.)\1{2,}/.test(password);
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, level: 'very_weak', label: 'Very Weak', color: '#dc2626', entropy: 0, crackTime: 'instantly', feedback: ['Enter a password'] };
  }

  const feedback: string[] = [];
  let deductions = 0;

  // Base entropy
  const entropy = calculateEntropy(password);
  let score = Math.min(100, Math.floor(entropy / 1.2));

  // Length bonus/penalty
  if (password.length < 8) {
    deductions += 20;
    feedback.push('Use at least 8 characters');
  } else if (password.length < 12) {
    deductions += 5;
    feedback.push('Consider using 12+ characters');
  } else if (password.length >= 16) {
    score = Math.min(100, score + 10);
  }

  // Character variety bonus
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (variety < 3) {
    deductions += 15;
    feedback.push('Mix uppercase, lowercase, numbers, and symbols');
  } else if (variety === 4) {
    score = Math.min(100, score + 5);
  }

  // Common password penalty
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    score = Math.min(score, 5);
    feedback.push('This is a commonly used password');
  }

  // Sequential chars penalty
  if (hasSequentialChars(password)) {
    deductions += 10;
    feedback.push('Avoid sequential characters (abc, 123)');
  }

  // Repeating chars penalty
  if (hasRepeatingChars(password)) {
    deductions += 10;
    feedback.push('Avoid repeating characters (aaa, 111)');
  }

  // Short password penalty
  if (password.length <= 6) {
    deductions += 25;
    feedback.push('Very short passwords are easily cracked');
  }

  score = Math.max(0, Math.min(100, score - deductions));

  let level: PasswordStrength['level'];
  let label: string;
  let color: string;

  if (score < 20) {
    level = 'very_weak'; label = 'Very Weak'; color = '#dc2626';
  } else if (score < 40) {
    level = 'weak'; label = 'Weak'; color = '#f97316';
  } else if (score < 60) {
    level = 'fair'; label = 'Fair'; color = '#eab308';
  } else if (score < 80) {
    level = 'strong'; label = 'Strong'; color = '#22c55e';
  } else {
    level = 'very_strong'; label = 'Very Strong'; color = '#16a34a';
  }

  if (feedback.length === 0) {
    feedback.push('Great password!');
  }

  return { score, level, label, color, entropy, crackTime: estimateCrackTime(entropy), feedback };
}
