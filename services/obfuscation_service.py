import os
import re
import logging
from typing import Dict, List, Tuple, Any
import hashlib

class ObfuscationService:
    """Service for detecting code obfuscation in decompiled APK files"""
    MAX_SNIPPETS_FOR_FRONTEND = 1000 # Anda bisa coba 500, 1000, atau 2000
    
    def __init__(self, socketio=None):
        self.socketio = socketio
        self.obfuscation_patterns = self._initialize_patterns()
        self.confidence_threshold = 30
        
    def _initialize_patterns(self):
        """Initialize obfuscation detection patterns for Smali files"""
        return {
            'short_class_names': {
                'pattern': r'\.class\s+.*?([a-zA-Z]\$?[a-zA-Z]?;|[a-zA-Z];)',
                'description': 'Short class names (1-2 characters)',
                'severity': 'high',
                'weight': 4
            },
            'short_method_names': {
                'pattern': r'\.method\s+.*?\s+([a-zA-Z]\(|[a-zA-Z]{2}\()',
                'description': 'Short method names (1-2 characters)',
                'severity': 'high',
                'weight': 4
            },
            'short_field_names': {
                'pattern': r'\.field\s+.*?\s+([a-zA-Z]:)',
                'description': 'Short field names (1 character)',
                'severity': 'high',
                'weight': 3
            },
            'synthetic_methods': {
                'pattern': r'\.method\s+.*?synthetic\s+',
                'description': 'Synthetic methods (compiler generated)',
                'severity': 'medium',
                'weight': 2
            },
            'access_methods': {
                'pattern': r'access\$\d+',
                'description': 'Synthetic access methods',
                'severity': 'medium',
                'weight': 2
            },
            'obfuscated_packages': {
                'pattern': r'L[a-zA-Z]/[a-zA-Z]/[a-zA-Z]/',
                'description': 'Single character package names',
                'severity': 'high',
                'weight': 3
            },
            'string_encryption': {
                'pattern': r'(decrypt|encode|decode|cipher)\s*\(',
                'description': 'String encryption/decryption methods',
                'severity': 'high',
                'weight': 4
            },
            'reflection_usage': {
                'pattern': r'(Class\.forName|getMethod|getDeclaredMethod|invoke)',
                'description': 'Java reflection usage',
                'severity': 'medium',
                'weight': 2
            },
            'base64_strings': {
                'pattern': r'"[A-Za-z0-9+/]{20,}={0,2}"',
                'description': 'Base64 encoded strings',
                'severity': 'medium',
                'weight': 2
            },
            'hex_strings': {
                'pattern': r'"[0-9a-fA-F]{16,}"',
                'description': 'Hexadecimal encoded strings',
                'severity': 'medium',
                'weight': 2
            },
            'proguard_signatures': {
                'pattern': r'# compiled from:.*\.java',
                'description': 'ProGuard compilation signatures',
                'severity': 'low',
                'weight': 1
            },
            'dollar_classes': {
                'pattern': r'\$[a-zA-Z0-9]+\.smali',
                'description': 'Inner classes with obfuscated names',
                'severity': 'medium',
                'weight': 2
            }
        }
    
    def analyze_obfuscation(self, output_dir: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Analyze obfuscation in decompiled APK files
        
        Args:
            output_dir: Path to decompiled APK directory
            
        Returns:
            Tuple of (success, obfuscation_data)
        """
        try:
            if self.socketio:
                self.socketio.emit('analysis_status', {'message': 'Starting obfuscation analysis...'})
            
            # Find all Smali files (primary) and Java files (secondary)
            smali_files = self._find_smali_files(output_dir)
            java_files = self._find_java_files(output_dir)
            
            all_files = smali_files + java_files
            
            if not all_files:
                logging.warning("No Smali or Java files found for obfuscation analysis")
                return True, {
                    'is_obfuscated': False,
                    'confidence': 0,
                    'indicators': [],
                    'code_snippets': [],
                    'summary': 'No code files found for analysis'
                }
            
            logging.info(f"Found {len(smali_files)} Smali files and {len(java_files)} Java files")
            
            # Analyze each file
            all_indicators = {}
            all_code_snippets = []
            total_lines_analyzed = 0
            files_to_analyze = all_files
            
            for i, code_file in enumerate(files_to_analyze):
                if self.socketio:
                    progress = int((i / len(files_to_analyze)) * 100)
                    self.socketio.emit('analysis_progress', {
                        'message': f'Analyzing file {i+1}/{len(files_to_analyze)}',
                        'progress': progress
                    })
                
                indicators, snippets, lines_count = self._analyze_file(code_file, output_dir)
                
                # Merge indicators
                for indicator_type, count in indicators.items():
                    if indicator_type not in all_indicators:
                        all_indicators[indicator_type] = 0
                    all_indicators[indicator_type] += count
                
                # Add snippets
                all_code_snippets.extend(snippets)
                total_lines_analyzed += lines_count
            
            # Additional analysis for file structure patterns
            structure_indicators = self._analyze_file_structure(smali_files)
            for indicator_type, count in structure_indicators.items():
                if indicator_type not in all_indicators:
                    all_indicators[indicator_type] = 0
                all_indicators[indicator_type] += count
            
            # Calculate confidence score
            confidence = self._calculate_confidence(all_indicators, total_lines_analyzed, len(smali_files))
            is_obfuscated = confidence >= self.confidence_threshold
            
            # Format indicators for response
            formatted_indicators = []
            for indicator_type, count in all_indicators.items():
                if count > 0:
                    pattern_info = self.obfuscation_patterns.get(indicator_type, {})
                    formatted_indicators.append({
                        'type': indicator_type,
                        'count': count,
                        'severity': pattern_info.get('severity', 'unknown'),
                        'description': pattern_info.get('description', 'Unknown pattern')
                    })
            
            # Sort code snippets by severity and file path
            all_code_snippets.sort(key=lambda x: (
                {'high': 0, 'medium': 1, 'low': 2}.get(x.get('severity', 'low'), 2),
                x.get('file', '')
            ))

            if len(all_code_snippets) > self.MAX_SNIPPETS_FOR_FRONTEND:
                logging.warning(f"Frontend: Too many snippets ({len(all_code_snippets)}), sending only {self.MAX_SNIPPETS_FOR_FRONTEND} for display.")
            
            result = {
                'is_obfuscated': is_obfuscated,
                'confidence': confidence,
                'indicators': formatted_indicators,
                'code_snippets': all_code_snippets,
                'summary': f'Analyzed {len(files_to_analyze)} files ({len(smali_files)} Smali, {len(java_files)} Java), found {len(all_code_snippets)} obfuscated code snippets',
                'files_analyzed': len(files_to_analyze),
                'total_snippets': len(all_code_snippets),
                'smali_files_count': len(smali_files),
                'java_files_count': len(java_files)
            }
            
            if self.socketio:
                self.socketio.emit('analysis_status', {
                    'message': f'Obfuscation analysis complete. Confidence: {confidence}%, Found {len(all_code_snippets)} code snippets.'
                })
            
            logging.info(f"Obfuscation analysis complete: {confidence}% confidence, {len(all_code_snippets)} snippets found")
            return True, result
            
        except Exception as e:
            logging.exception(f"Error during obfuscation analysis: {e}")
            return False, {
                'is_obfuscated': False,
                'confidence': 0,
                'indicators': [],
                'code_snippets': [],
                'error': str(e)
            }
    
    def _find_smali_files(self, output_dir: str) -> List[str]:
        """Find all Smali files in the decompiled directory"""
        smali_files = []
        
        # Look for Smali files in common locations
        search_paths = [
            os.path.join(output_dir, 'smali'),
            os.path.join(output_dir, 'smali_classes2'),
            os.path.join(output_dir, 'smali_classes3'),
            output_dir
        ]
        
        for search_path in search_paths:
            if os.path.exists(search_path):
                for root, dirs, files in os.walk(search_path):
                    for file in files:
                        if file.endswith('.smali'):
                            smali_files.append(os.path.join(root, file))
        
        logging.info(f"Found {len(smali_files)} Smali files for obfuscation analysis")
        return smali_files
    
    def _find_java_files(self, output_dir: str) -> List[str]:
        """Find all Java files in the decompiled directory"""
        java_files = []
        
        # Look for Java files in common decompiled locations
        search_paths = [
            os.path.join(output_dir, 'sources'),
            os.path.join(output_dir, 'src'),
            output_dir
        ]
        
        for search_path in search_paths:
            if os.path.exists(search_path):
                for root, dirs, files in os.walk(search_path):
                    for file in files:
                        if file.endswith('.java'):
                            java_files.append(os.path.join(root, file))
        
        logging.info(f"Found {len(java_files)} Java files for obfuscation analysis")
        return java_files
    
    def _analyze_file_structure(self, smali_files: List[str]) -> Dict[str, int]:
        """Analyze file structure patterns for obfuscation indicators"""
        indicators = {}
        
        # Count files with short names
        short_name_count = 0
        dollar_class_count = 0
        
        for file_path in smali_files:
            filename = os.path.basename(file_path)
            
            # Check for short class names (without .smali extension)
            class_name = filename.replace('.smali', '')
            if len(class_name) <= 2 and class_name.isalpha():
                short_name_count += 1
            
            # Check for dollar classes (inner classes)
            if '$' in filename:
                dollar_class_count += 1
        
        if short_name_count > 0:
            indicators['short_class_names'] = short_name_count
        
        if dollar_class_count > 0:
            indicators['dollar_classes'] = dollar_class_count
        
        return indicators
    
    def _analyze_file(self, file_path: str, base_dir: str) -> Tuple[Dict[str, int], List[Dict], int]:
        """
        Analyze a single code file for obfuscation patterns
        
        Returns:
            Tuple of (indicators_count, code_snippets, total_lines)
        """
        indicators = {}
        code_snippets = []
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')
            
            # Get relative file path
            relative_path = os.path.relpath(file_path, base_dir)
            
            # Analyze each pattern
            for pattern_name, pattern_info in self.obfuscation_patterns.items():
                pattern = pattern_info['pattern']
                matches = list(re.finditer(pattern, content, re.IGNORECASE | re.MULTILINE))
                
                if matches:
                    indicators[pattern_name] = len(matches)
                    
                    # Extract code snippets for first few matches
                    for match in matches[:3]:  # Limit to 3 snippets per pattern per file
                        snippet = self._extract_code_snippet(
                            content, lines, match, relative_path, pattern_name, pattern_info
                        )
                        if snippet:
                            code_snippets.append(snippet)
            
            return indicators, code_snippets, len(lines)
            
        except Exception as e:
            logging.warning(f"Error analyzing file {file_path}: {e}")
            return {}, [], 0
    
    def _extract_code_snippet(self, content: str, lines: List[str], match, 
                            file_path: str, pattern_name: str, pattern_info: Dict) -> Dict:
        """Extract a code snippet around a match"""
        try:
            # Find line number of the match
            line_start = content[:match.start()].count('\n')
            line_end = content[:match.end()].count('\n')
            
            # Extract context (5 lines before and after for Smali files)
            context_start = max(0, line_start - 5)
            context_end = min(len(lines), line_end + 6)
            
            # Get the code snippet with context
            snippet_lines = lines[context_start:context_end]
            snippet_code = '\n'.join(snippet_lines)
            
            # Highlight the matched line
            matched_line = lines[line_start] if line_start < len(lines) else ""
            
            return {
                'id': hashlib.md5(f"{file_path}:{line_start}:{pattern_name}".encode()).hexdigest()[:8],
                'type': pattern_info.get('description', pattern_name),
                'file': file_path,
                'line_start': line_start + 1,  # 1-based line numbers
                'line_end': line_end + 1,
                'matched_text': match.group(),
                'matched_line': matched_line.strip(),
                'code_snippet': snippet_code,
                'context_start': context_start + 1,
                'context_end': context_end,
                'severity': pattern_info.get('severity', 'medium'),
                'pattern_type': pattern_name
            }
            
        except Exception as e:
            logging.warning(f"Error extracting code snippet: {e}")
            return None
    
    def _calculate_confidence(self, indicators: Dict[str, int], total_lines: int, smali_file_count: int) -> int:
        """Calculate obfuscation confidence score with enhanced logic for Smali files"""
        if total_lines == 0:
            return 0
        
        total_score = 0
        max_possible_score = 0
        
        # Base scoring from pattern matches
        for pattern_name, count in indicators.items():
            pattern_info = self.obfuscation_patterns.get(pattern_name, {})
            weight = pattern_info.get('weight', 1)
            
            # Calculate score based on frequency
            frequency = count / max(total_lines, 1)
            pattern_score = min(frequency * 1000, 100) * weight  # Cap at 100 per pattern
            total_score += pattern_score
            max_possible_score += 100 * weight
        
        if max_possible_score == 0:
            base_confidence = 0
        else:
            base_confidence = min(int((total_score / max_possible_score) * 100), 100)
        
        # Enhanced heuristics for Smali files
        confidence_boost = 0
        
        # High confidence indicators
        if indicators.get('short_class_names', 0) > smali_file_count * 0.3:  # More than 30% short class names
            confidence_boost += 30
            
        if indicators.get('short_method_names', 0) > total_lines * 0.05:  # More than 5% short method names
            confidence_boost += 25
            
        if indicators.get('synthetic_methods', 0) > 10:  # Many synthetic methods
            confidence_boost += 20
            
        if indicators.get('access_methods', 0) > 5:  # Multiple access methods
            confidence_boost += 15
            
        if indicators.get('obfuscated_packages', 0) > 0:  # Single char package names
            confidence_boost += 20
            
        # Medium confidence indicators
        if indicators.get('dollar_classes', 0) > smali_file_count * 0.2:  # Many inner classes
            confidence_boost += 15
            
        if indicators.get('string_encryption', 0) > 3:  # Multiple encryption patterns
            confidence_boost += 15
        
        # Combine base confidence with boosts
        final_confidence = min(base_confidence + confidence_boost, 100)
        
        # Minimum confidence if we have clear obfuscation indicators
        if (indicators.get('short_class_names', 0) > 0 and 
            indicators.get('short_method_names', 0) > 0):
            final_confidence = max(final_confidence, 60)  # At least 60% if both present
        
        return final_confidence
    
    def get_obfuscation_techniques(self) -> List[Dict[str, str]]:
        """Get list of supported obfuscation detection techniques"""
        techniques = []
        for pattern_name, pattern_info in self.obfuscation_patterns.items():
            techniques.append({
                'name': pattern_name,
                'description': pattern_info.get('description', ''),
                'severity': pattern_info.get('severity', 'unknown')
            })
        return techniques
