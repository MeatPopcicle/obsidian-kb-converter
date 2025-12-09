import { App, normalizePath } from 'obsidian';

export class Logger {
	private app: App;
	private logPath: string;
	private logs: string[] = [];
	private pluginDir: string;

	constructor(app: App) {
		this.app = app;
		// Log file in plugin's config directory
		this.pluginDir = normalizePath('.obsidian/plugins/kb-converter');
		this.logPath = normalizePath(`${this.pluginDir}/kb-converter.log`);
	}

	private timestamp(): string {
		return new Date().toISOString();
	}

	private formatMessage(level: string, message: string, data?: any): string {
		let logLine = `[${this.timestamp()}] [${level}] ${message}`;
		if (data !== undefined) {
			if (data instanceof Error) {
				logLine += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
			} else if (typeof data === 'object') {
				try {
					logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`;
				} catch {
					logLine += `\n  Data: [Unable to stringify]`;
				}
			} else {
				logLine += `\n  Data: ${data}`;
			}
		}
		return logLine;
	}

	info(message: string, data?: any) {
		const formatted = this.formatMessage('INFO', message, data);
		console.log(`[KB-Converter] ${message}`, data !== undefined ? data : '');
		this.logs.push(formatted);
		this.flush();
	}

	warn(message: string, data?: any) {
		const formatted = this.formatMessage('WARN', message, data);
		console.warn(`[KB-Converter] ${message}`, data !== undefined ? data : '');
		this.logs.push(formatted);
		this.flush();
	}

	error(message: string, error?: any) {
		const formatted = this.formatMessage('ERROR', message, error);
		console.error(`[KB-Converter] ${message}`, error !== undefined ? error : '');
		this.logs.push(formatted);
		this.flush();
	}

	debug(message: string, data?: any) {
		const formatted = this.formatMessage('DEBUG', message, data);
		console.log(`[KB-Converter DEBUG] ${message}`, data !== undefined ? data : '');
		this.logs.push(formatted);
		this.flush();
	}

	private async flush() {
		try {
			// Read existing log file if it exists
			let existingContent = '';
			if (await this.app.vault.adapter.exists(this.logPath)) {
				existingContent = await this.app.vault.adapter.read(this.logPath);
			}

			// Append new logs
			const newContent = existingContent + this.logs.join('\n') + '\n';
			await this.app.vault.adapter.write(this.logPath, newContent);

			// Clear buffer
			this.logs = [];

			// Trim log file if it gets too large (keep last 1000 lines)
			const lines = newContent.split('\n');
			if (lines.length > 1000) {
				const trimmed = lines.slice(-1000).join('\n');
				await this.app.vault.adapter.write(this.logPath, trimmed);
			}
		} catch (e) {
			// Can't log logging errors, just console
			console.error('[KB-Converter] Failed to write log file:', e);
		}
	}

	async clear() {
		try {
			await this.app.vault.adapter.write(this.logPath, '');
			console.log('[KB-Converter] Log file cleared');
		} catch (e) {
			console.error('[KB-Converter] Failed to clear log file:', e);
		}
	}

	getLogPath(): string {
		return this.logPath;
	}
}
