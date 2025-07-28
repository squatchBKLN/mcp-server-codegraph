import { AbstractAnalyzer } from './AbstractAnalyzer.js';
import type { Entity, Relationship, AnalysisResult } from '../types/index.js';
import { EntityType } from '../types/index.js';

export interface CrossFileContext {
  packageToFile: Map<string, string>;
  allFiles: Map<string, string>;
  entities: Map<string, Entity>;
}

export class PerlAnalyzer extends AbstractAnalyzer {

  public initializeParser(): void {
    // No parser initialization needed for regex-based approach
    this.parser = null;
  }

  analyzeFile(filePath: string, content: string, crossFileContext?: CrossFileContext): AnalysisResult {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    const lines = content.split('\n');

    // Parse different Perl constructs using regex
    this.parsePackageStatements(lines, entities, filePath);
    this.parseUseStatements(lines, entities, relationships, filePath, crossFileContext);

    return { entities, relationships };
  }

  private parsePackageStatements(lines: string[], entities: Entity[], filePath: string): void {
    const packageRegex = /^\s*package\s+([A-Za-z_][A-Za-z0-9_:]*)\s*;/;
    
    lines.forEach((line, index) => {
      const match = line.match(packageRegex);
      if (match) {
        const packageName = match[1];
        const entity: Entity = {
          id: this.generateId(filePath, packageName),
          name: packageName,
          type: EntityType.CLASS,
          filePath,
          startLine: index + 1,
          endLine: index + 1,
          startColumn: match.index! + 1,
          endColumn: match.index! + match[0].length + 1,
          metadata: {
            isNamespace: true
          }
        };
        entities.push(entity);
      }
    });
  }

  private parseUseStatements(lines: string[], entities: Entity[], relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
    const useRegex = /^\s*(use|require)\s+([A-Za-z_][A-Za-z0-9_:]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)/;
    const importedModules: string[] = [];
    
    lines.forEach((line, index) => {
      const match = line.match(useRegex);
      if (match) {
        const importType = match[1];
        const moduleName = match[2];
        
        // Skip pragmas like 'use strict', 'use warnings'
        if (['strict', 'warnings', 'utf8', 'feature'].includes(moduleName)) {
          return;
        }
        
        // Skip CPAN modules (external dependencies)
        if (this.isCPANModule(moduleName)) {
          return;
        }
        
        const entity: Entity = {
          id: this.generateId(filePath, moduleName),
          name: moduleName,
          type: EntityType.IMPORT,
          filePath,
          startLine: index + 1,
          endLine: index + 1,
          startColumn: match.index! + 1,
          endColumn: match.index! + match[0].length + 1,
          metadata: {
            importType: importType
          }
        };
        entities.push(entity);
        importedModules.push(moduleName);

        // Create file-level relationship if we can resolve the module
        if (crossFileContext) {
          const targetFile = this.resolveModuleToFile(moduleName, crossFileContext);
          if (targetFile) {
            const sourceFileId = `file:${filePath}`;
            const targetFileId = `file:${targetFile}`;
            
            // Check if relationship already exists to avoid duplicates
            const existingRelationship = relationships.find(rel => 
              rel.sourceFileId === sourceFileId && rel.targetFileId === targetFileId
            );
            
            if (!existingRelationship) {
              const relationship: Relationship = {
                id: this.generateRelationshipId(),
                sourceFileId: sourceFileId,
                targetFileId: targetFileId,
                type: 'imports',
                metadata: {
                  importedModules: [moduleName],
                  importType: importType
                }
              };
              relationships.push(relationship);
            } else {
              // Add to existing relationship's imported modules
              if (!existingRelationship.metadata!.importedModules!.includes(moduleName)) {
                existingRelationship.metadata!.importedModules!.push(moduleName);
              }
            }
          }
        }
      }
    });
  }

  // CPAN module detection
  private isCPANModule(moduleName: string): boolean {
    // Common CPAN modules that should be ignored
    const commonCPANModules = [
      // Core modules that are commonly used
      'Data::Dumper', 'JSON', 'JSON::PP', 'JSON::XS',
      'DBI', 'DBD::mysql', 'DBD::Pg', 'DBD::SQLite',
      'LWP::UserAgent', 'HTTP::Request', 'HTTP::Response',
      'CGI', 'CGI::Session', 'CGI::Cookie',
      'Template', 'Template::Toolkit',
      'Moose', 'Mouse', 'Moo',
      'DateTime', 'DateTime::Format::Strptime',
      'File::Slurp', 'File::Find', 'File::Basename', 'File::Path', 'File::Spec',
      'List::Util', 'List::MoreUtils',
      'Scalar::Util',
      'Digest::MD5', 'Digest::SHA',
      'MIME::Base64',
      'Encode',
      'Getopt::Long', 'Getopt::Std',
      'Pod::Usage',
      'Test::More', 'Test::Simple', 'Test::Exception',
      'YAML', 'YAML::Tiny', 'YAML::XS',
      'XML::Simple', 'XML::LibXML',
      'Carp', 'Carp::Always',
      'FindBin',
      'lib',
      'constant',
      'base', 'parent',
      'Exporter',
      'AutoLoader', 'SelfLoader',
      'POSIX',
      'IO::File', 'IO::Handle', 'IO::Socket',
      'Socket',
      'Fcntl',
      'SDBM_File', 'NDBM_File', 'ODBM_File', 'GDBM_File', 'DB_File',
      'Tie::Hash', 'Tie::Array',
      'Config',
      'English',
      'Symbol',
      'SelectSaver',
      'FileHandle',
      'DirHandle',
      'Benchmark',
      'Dumpvalue',
      'Env',
      'Errno',
      'Fatal',
      'I18N::Collate',
      'IPC::Open2', 'IPC::Open3',
      'Net::Ping', 'Net::FTP', 'Net::SMTP',
      'Safe',
      'Search::Dict',
      'Sys::Hostname', 'Sys::Syslog',
      'Term::ANSIColor', 'Term::Cap', 'Term::Complete', 'Term::ReadLine',
      'Text::Abbrev', 'Text::ParseWords', 'Text::Soundex', 'Text::Tabs', 'Text::Wrap',
      'Thread', 'Thread::Queue', 'Thread::Semaphore',
      'Time::Local', 'Time::gmtime', 'Time::localtime',
      'User::grent', 'User::pwent'
    ];
    
    // Check if it's in the common CPAN modules list
    if (commonCPANModules.includes(moduleName)) {
      return true;
    }
    
    // Heuristic: If it contains multiple :: separators and starts with common CPAN namespaces
    const cpanNamespaces = [
      'Acme::', 'Algorithm::', 'App::', 'Archive::', 'Attribute::', 'Audio::',
      'B::', 'Benchmark::', 'Bio::', 'Business::', 'Bundle::', 'Cache::', 'Catalyst::',
      'Class::', 'Compress::', 'Config::', 'Convert::', 'CPAN::', 'Crypt::', 'DBIx::',
      'Data::', 'Date::', 'DateTime::', 'Devel::', 'Device::', 'Digest::', 'Email::',
      'Encode::', 'Error::', 'ExtUtils::', 'File::', 'Finance::', 'Font::', 'Games::',
      'GD::', 'Getopt::', 'Graph::', 'HTML::', 'HTTP::', 'Image::', 'IO::', 'IPC::',
      'JSON::', 'LWP::', 'Lingua::', 'List::', 'Log::', 'MIME::', 'Mail::', 'Math::',
      'Module::', 'Mojo::', 'Net::', 'Number::', 'Object::', 'PDF::', 'POE::', 'Parse::',
      'Path::', 'Perl::', 'Pod::', 'Proc::', 'Regexp::', 'SQL::', 'Scalar::', 'Set::',
      'Statistics::', 'String::', 'Sys::', 'Task::', 'Template::', 'Term::', 'Test::',
      'Text::', 'Thread::', 'Tie::', 'Time::', 'Tree::', 'URI::', 'Unicode::', 'WWW::',
      'XML::', 'YAML::'
    ];
    
    for (const namespace of cpanNamespaces) {
      if (moduleName.startsWith(namespace)) {
        return true;
      }
    }
    
    // If module name has 3+ parts (e.g., Some::Deep::Module), likely CPAN
    const parts = moduleName.split('::');
    if (parts.length >= 3) {
      return true;
    }
    
    return false;
  }

  // Cross-file resolution methods
  private resolveModuleToFile(moduleName: string, context: CrossFileContext): string | null {
    // First try direct package name lookup
    if (context.packageToFile.has(moduleName)) {
      return context.packageToFile.get(moduleName)!;
    }
    
    // Try converting package name to file path (Package::Name -> Package/Name.pm)
    const possiblePath = moduleName.replace(/::/g, '/') + '.pm';
    if (context.allFiles.has(possiblePath)) {
      return possiblePath;
    }
    
    // Try other common patterns
    const altPath = moduleName.replace(/::/g, '/') + '.pl';
    if (context.allFiles.has(altPath)) {
      return altPath;
    }
    
    return null;
  }
}
