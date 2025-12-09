import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Logger } from '../utils/logger';

export interface ConvertedImage {
	filename: string;
	data: ArrayBuffer;
	contentType: string;
}

export interface DocxToMdResult {
	markdown: string;
	images: ConvertedImage[];
}

/**
 * Convert DOCX to Markdown using mammoth + turndown
 */
export class DocxToMdConverter {
	private turndown: TurndownService;
	private images: ConvertedImage[] = [];
	private imageCounter = 0;
	private docBasename = 'document';
	private logger: Logger | null = null;

	constructor(logger?: Logger) {
		this.logger = logger || null;
		this.turndown = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
			bulletListMarker: '-'
		});

		// Add GFM support (tables, strikethrough, etc.)
		this.turndown.use(gfm);

		// Custom rule for images - convert to Obsidian syntax
		this.turndown.addRule('obsidianImages', {
			filter: 'img',
			replacement: (content, node) => {
				const img = node as HTMLImageElement;
				const src = img.getAttribute('src') || '';
				const alt = img.getAttribute('alt') || '';

				// If it's a data URL or extracted image, use our renamed filename
				if (src.startsWith('data:') || src.includes('image')) {
					// The actual filename will be set during image extraction
					// For now, use a placeholder that we'll replace later
					const placeholder = `__IMAGE_${this.imageCounter}__`;
					return `![[${placeholder}]]`;
				}

				return `![[${src}]]`;
			}
		});
	}

	private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
		if (this.logger) {
			this.logger[level](message, data);
		} else {
			console[level === 'debug' ? 'log' : level](`[DocxToMd] ${message}`, data || '');
		}
	}

	/**
	 * Convert DOCX buffer to Markdown
	 */
	async convert(docxBuffer: ArrayBuffer, basename: string): Promise<DocxToMdResult> {
		this.images = [];
		this.imageCounter = 0;
		this.docBasename = basename;

		this.log('info', `Starting conversion of ${basename}`);
		this.log('debug', `Buffer size: ${docxBuffer.byteLength} bytes`);

		try {
			// Convert ArrayBuffer to Buffer for mammoth (Node.js style)
			const buffer = Buffer.from(docxBuffer);
			this.log('debug', `Converted to Buffer, size: ${buffer.length}`);

			// Convert DOCX to HTML using mammoth
			this.log('info', 'Calling mammoth.convertToHtml...');
			const result = await mammoth.convertToHtml(
				{ buffer: buffer },  // Use buffer instead of arrayBuffer
				{
					convertImage: mammoth.images.imgElement((image) => {
						return this.extractImage(image);
					})
				}
			);

			this.log('info', `Mammoth conversion complete, HTML length: ${result.value.length}`);

			let html = result.value;

				// Log any conversion messages/warnings
			if (result.messages.length > 0) {
				this.log('warn', 'Mammoth conversion messages:', result.messages);
			}

			// Convert HTML to Markdown
			this.log('info', 'Converting HTML to Markdown with Turndown...');
			let markdown = this.turndown.turndown(html);
			this.log('debug', `Markdown length: ${markdown.length}`);

			// Replace image placeholders with actual filenames
			this.log('info', `Processing ${this.images.length} images...`);
			for (let i = 0; i < this.images.length; i++) {
				const placeholder = `__IMAGE_${i}__`;
				markdown = markdown.replace(placeholder, this.images[i].filename);
				this.log('debug', `Replaced placeholder for image: ${this.images[i].filename}`);
			}

			// Clean up the markdown
			markdown = this.cleanupMarkdown(markdown);
			this.log('info', `Conversion complete. Final markdown length: ${markdown.length}`);

			return {
				markdown,
				images: this.images
			};
		} catch (error) {
			this.log('error', 'DOCX to Markdown conversion failed', error);
			throw error;
		}
	}

	/**
	 * Extract image from DOCX and store for later saving
	 */
	private async extractImage(image: any): Promise<{ src: string }> {
		const imageIndex = this.imageCounter++;

		try {
			const buffer = await image.readAsArrayBuffer();
			const contentType = image.contentType || 'image/png';

			// Determine extension from content type
			let ext = '.png';
			if (contentType.includes('jpeg') || contentType.includes('jpg')) {
				ext = '.jpg';
			} else if (contentType.includes('gif')) {
				ext = '.gif';
			} else if (contentType.includes('webp')) {
				ext = '.webp';
			}

			// Generate filename: {docname}-image-{counter}.{ext}
			const filename = `${this.docBasename}-image-${String(imageIndex + 1).padStart(2, '0')}${ext}`;

			this.images.push({
				filename,
				data: buffer,
				contentType
			});

			// Return a placeholder src that we'll replace in the markdown
			return { src: `__IMAGE_${imageIndex}__` };
		} catch (error) {
			console.error('Failed to extract image:', error);
			return { src: '' };
		}
	}

	/**
	 * Clean up converted markdown
	 */
	private cleanupMarkdown(markdown: string): string {
		// Remove excessive blank lines (more than 2 consecutive)
		markdown = markdown.replace(/\n{3,}/g, '\n\n');

		// Remove trailing whitespace from lines
		markdown = markdown.replace(/[ \t]+$/gm, '');

		// Detect and format CLI commands
		markdown = this.formatCliCommands(markdown);

		// Ensure file ends with single newline
		markdown = markdown.trim() + '\n';

		return markdown;
	}

	/**
	 * Common CLI commands and tools to detect
	 */
	private static readonly CLI_COMMANDS = new Set([
		// Shell/system
		'curl', 'wget', 'ssh', 'scp', 'rsync', 'tar', 'gzip', 'gunzip', 'zip', 'unzip',
		'chmod', 'chown', 'chgrp', 'sudo', 'su', 'whoami', 'id', 'uname',
		'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'head', 'tail',
		'less', 'more', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'cut', 'sort', 'uniq',
		'wc', 'find', 'locate', 'which', 'whereis', 'file', 'stat', 'du', 'df',
		'touch', 'ln', 'readlink', 'basename', 'dirname', 'realpath',
		'echo', 'printf', 'read', 'export', 'env', 'set', 'unset', 'source',
		'alias', 'type', 'command', 'hash', 'history', 'fc',
		'ps', 'top', 'htop', 'kill', 'killall', 'pkill', 'pgrep', 'jobs', 'bg', 'fg', 'nohup',
		'systemctl', 'service', 'journalctl', 'dmesg', 'crontab', 'at',
		'mount', 'umount', 'fdisk', 'lsblk', 'blkid', 'mkfs', 'fsck',
		'ip', 'ifconfig', 'netstat', 'ss', 'ping', 'traceroute', 'dig', 'nslookup', 'host',
		'nc', 'netcat', 'telnet', 'ftp', 'sftp',
		'iptables', 'firewall-cmd', 'ufw',
		// Package managers
		'apt', 'apt-get', 'apt-cache', 'dpkg', 'yum', 'dnf', 'rpm', 'zypper',
		'pacman', 'brew', 'port', 'snap', 'flatpak',
		'pip', 'pip3', 'pipx', 'conda', 'virtualenv', 'venv',
		'gem', 'bundle', 'bundler',
		'cargo', 'rustup', 'rustc',
		'go', 'gofmt',
		'composer', 'php', 'artisan',
		'nuget', 'dotnet',
		// Node.js/JavaScript
		'npm', 'npx', 'yarn', 'pnpm', 'node', 'nodejs', 'nvm', 'fnm',
		'tsc', 'tsx', 'esbuild', 'vite', 'webpack', 'rollup', 'parcel',
		'eslint', 'prettier', 'jest', 'vitest', 'mocha',
		// Python
		'python', 'python3', 'py', 'pytest', 'poetry', 'pdm', 'uv',
		'django-admin', 'flask', 'uvicorn', 'gunicorn',
		// Java/JVM
		'java', 'javac', 'jar', 'mvn', 'maven', 'gradle', 'gradlew', 'ant',
		'scala', 'sbt', 'kotlin', 'kotlinc', 'clojure', 'lein',
		// Containers/Cloud
		'docker', 'docker-compose', 'podman', 'buildah', 'skopeo',
		'kubectl', 'k9s', 'helm', 'minikube', 'kind', 'k3s', 'k3d',
		'terraform', 'terragrunt', 'pulumi', 'ansible', 'ansible-playbook',
		'aws', 'az', 'gcloud', 'gsutil', 'bq', 'oc', 'eksctl',
		'vagrant', 'packer',
		// Version control
		'git', 'gh', 'hub', 'svn', 'hg', 'mercurial',
		// Editors/Tools
		'vim', 'nvim', 'vi', 'nano', 'emacs', 'code', 'subl',
		'make', 'cmake', 'ninja', 'meson', 'autoconf', 'automake',
		'gcc', 'g++', 'clang', 'clang++', 'ld', 'ar', 'nm', 'objdump',
		'gdb', 'lldb', 'valgrind', 'strace', 'ltrace',
		// Database
		'mysql', 'mysqldump', 'psql', 'pg_dump', 'pg_restore',
		'mongosh', 'mongo', 'mongodump', 'mongorestore',
		'redis-cli', 'sqlite3',
		// Misc tools
		'jq', 'yq', 'xargs', 'parallel', 'watch', 'timeout', 'date', 'cal',
		'base64', 'md5sum', 'sha256sum', 'openssl', 'gpg',
		'ffmpeg', 'convert', 'identify', 'pdftk', 'gs',
		'ansible', 'salt', 'puppet', 'chef',
	]);

	/**
	 * Check if a string looks like a CLI command
	 */
	private looksLikeCliCommand(text: string): boolean {
		let trimmed = text.trim();
		if (!trimmed || trimmed.length < 2) return false;

		// Skip if already in code formatting
		if (trimmed.startsWith('`') || trimmed.startsWith('```')) return false;

		// Skip URLs (but not if they're part of a command)
		if (/^https?:\/\//.test(trimmed) && !trimmed.includes(' ')) return false;

		// Skip if it's just a path without a command
		if (/^[\/~][\w\/.-]+$/.test(trimmed) && !trimmed.includes(' ')) return false;

		// Strip common prompt characters (# $ > %) from the beginning
		// But only if followed by a command, not if it's a markdown header
		const promptMatch = trimmed.match(/^([#$>%]+)\s*(\S.*)/);
		if (promptMatch) {
			trimmed = promptMatch[2];
		}
		// Also handle #command with no space (like #curl)
		const noSpacePromptMatch = trimmed.match(/^[#$>%]([a-zA-Z][\w-]*.*)/);
		if (noSpacePromptMatch) {
			trimmed = noSpacePromptMatch[1];
		}

		// Get the first word (potential command)
		const firstWord = trimmed.split(/[\s|;&]/)[0].replace(/^(sudo\s+)?/, '').toLowerCase();

		// Check if it starts with a known CLI command
		if (DocxToMdConverter.CLI_COMMANDS.has(firstWord)) {
			return true;
		}

		// Check for CLI patterns even without known commands
		const cliPatterns = [
			// Has flags like -v, --verbose
			/\s-{1,2}[a-zA-Z][\w-]*/,
			// Has pipes
			/\s\|\s/,
			// Has redirections
			/\s[<>]{1,2}\s/,
			// Variable assignment at start
			/^[A-Z_][A-Z0-9_]*=/i,
			// Starts with ./ or ~/
			/^[.~]\/\S+/,
			// Has command substitution
			/\$\([^)]+\)/,
			/`[^`]+`/,
			// Environment variable references
			/\$[A-Z_][A-Z0-9_]*/i,
			// Looks like a shebang reference
			/^#!\/\S+/,
		];

		return cliPatterns.some(pattern => pattern.test(trimmed));
	}

	/**
	 * Check if text should be a code block (multi-line or long command)
	 */
	private shouldBeCodeBlock(text: string): boolean {
		// Multi-line commands
		if (text.includes('\n')) return true;

		// Very long commands (likely complex)
		if (text.length > 80) return true;

		// Has line continuation
		if (text.includes(' \\')) return true;

		// Multiple piped commands
		if ((text.match(/\|/g) || []).length >= 2) return true;

		return false;
	}

	/**
	 * Detect and format CLI commands in markdown
	 */
	private formatCliCommands(markdown: string): string {
		const lines = markdown.split('\n');
		const result: string[] = [];
		let cliDetected = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			// Skip lines that are already formatted
			if (trimmedLine.startsWith('```') ||
				trimmedLine.startsWith('`') ||
				trimmedLine.startsWith('>') ||
				trimmedLine.startsWith('-') ||
				trimmedLine.startsWith('*') ||
				trimmedLine.match(/^\d+\./)) {
				result.push(line);
				continue;
			}

			// Check for markdown headers (# followed by space and text, not a command)
			// But allow lines like "#curl" or "# curl -k" which are prompt-prefixed commands
			if (trimmedLine.match(/^#{1,6}\s+[A-Z]/i)) {
				// Looks like a real header (# Header Text)
				const afterHash = trimmedLine.replace(/^#+\s*/, '');
				if (!this.looksLikeCliCommand(afterHash)) {
					result.push(line);
					continue;
				}
			}

			// Skip empty lines
			if (!line.trim()) {
				result.push(line);
				continue;
			}

			// Check if this line looks like a CLI command
			if (this.looksLikeCliCommand(line)) {
				cliDetected++;
				const trimmed = line.trim();

				if (this.shouldBeCodeBlock(trimmed)) {
					// Wrap in code block
					result.push('```bash');
					result.push(trimmed);
					result.push('```');
				} else {
					// Wrap in inline code
					result.push(`\`${trimmed}\``);
				}
			} else {
				// Check for inline CLI commands within text
				const formatted = this.formatInlineCliCommands(line);
				result.push(formatted);
			}
		}

		if (cliDetected > 0) {
			this.log('info', `Detected and formatted ${cliDetected} CLI commands`);
		}

		return result.join('\n');
	}

	/**
	 * Format CLI commands that appear inline within text
	 */
	private formatInlineCliCommands(line: string): string {
		// Skip if line is mostly code-like already
		if ((line.match(/`/g) || []).length >= 2) return line;

		// Look for patterns like "run curl ..." or "use the git command"
		// This is more conservative to avoid false positives

		// Pattern: quoted commands that look like CLI
		line = line.replace(/"([^"]+)"/g, (match, content) => {
			if (this.looksLikeCliCommand(content) && content.length < 60) {
				return `\`${content}\``;
			}
			return match;
		});

		// Pattern: specific CLI tool mentions followed by their syntax
		const toolMentionPattern = new RegExp(
			`\\b(${Array.from(DocxToMdConverter.CLI_COMMANDS).slice(0, 50).join('|')})\\s+([\\w.-]+(?:\\s+-{1,2}[\\w-]+(?:=\\S+)?)+)`,
			'g'
		);
		line = line.replace(toolMentionPattern, (match, cmd, args) => {
			const fullCmd = `${cmd} ${args}`;
			if (fullCmd.length < 60) {
				return `\`${fullCmd}\``;
			}
			return match;
		});

		return line;
	}
}
