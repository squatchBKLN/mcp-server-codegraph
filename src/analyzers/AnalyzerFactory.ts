import type { SupportedLanguage } from '../types/index.js';
import { AbstractAnalyzer } from './AbstractAnalyzer.js';
import { PerlAnalyzer } from './PerlAnalyzer.js';

export class AnalyzerFactory {
  static createAnalyzer(language: SupportedLanguage): AbstractAnalyzer {
    switch (language) {
      case 'perl':
        return new PerlAnalyzer();
      case 'python':
        // TODO: Implement PythonAnalyzer
        throw new Error('Python analyzer not yet implemented');
      case 'javascript':
        // TODO: Implement JavaScriptAnalyzer
        throw new Error('JavaScript analyzer not yet implemented');
      case 'rust':
        // TODO: Implement RustAnalyzer
        throw new Error('Rust analyzer not yet implemented');
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }
}
