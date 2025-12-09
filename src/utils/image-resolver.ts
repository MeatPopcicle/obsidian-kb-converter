import { App, TFile } from 'obsidian';
import { ImageResolver } from '../generators/docx-generator';

/**
 * Resolves Obsidian image references to actual file data
 * Searches the entire vault for images by filename
 */
export class VaultImageResolver implements ImageResolver {
	private app: App;
	private cache: Map<string, TFile | null> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Find and load an image from the vault
	 * @param filename - The image filename (e.g., "screenshot.png" or full path)
	 */
	async resolve(filename: string): Promise<{ buffer: ArrayBuffer; width?: number; height?: number } | null> {
		// Extract just the filename if a path was provided
		const name = filename.split('/').pop() || filename;

		// Check cache first
		if (this.cache.has(name)) {
			const cached = this.cache.get(name);
			if (!cached) return null;
			return {
				buffer: await this.app.vault.readBinary(cached)
			};
		}

		// Search vault for the file
		const files = this.app.vault.getFiles();
		const imageFile = files.find(f => f.name === name);

		// Cache the result (including null for not found)
		this.cache.set(name, imageFile || null);

		if (!imageFile) {
			console.warn(`Image not found in vault: ${name}`);
			return null;
		}

		try {
			const buffer = await this.app.vault.readBinary(imageFile);
			return { buffer };
		} catch (error) {
			console.error(`Failed to read image ${name}:`, error);
			return null;
		}
	}

	/**
	 * Clear the image cache
	 */
	clearCache(): void {
		this.cache.clear();
	}
}
