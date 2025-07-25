import { extname } from 'path';
import type { SupportedLanguage } from '../types/index.js';

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const extension = extname(filePath).toLowerCase();
  
  switch (extension) {
    case '.py':
      return 'python';
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
      return 'javascript';
    case '.rs':
      return 'rust';
    case '.pl':        // Standard Perl extension
    case '.pm':        // Perl module
    case '.t':         // Perl test file
    case '.cgi':       // CGI scripts often Perl
      return 'perl';
    default:
      return null;
  }
}
