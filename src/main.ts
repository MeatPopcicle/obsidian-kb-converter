import { App, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';
import { KBConverterSettings, DEFAULT_SETTINGS, KBConverterSettingTab } from './settings';
import { parseMarkdown } from './parsers/markdown-parser';
import { DocxGenerator } from './generators/docx-generator';
import { VaultImageResolver } from './utils/image-resolver';
import { DocxToMdConverter } from './converters/docx-to-md';
import { Logger } from './utils/logger';
import { DocxView, DOCX_VIEW_TYPE } from './views/docx-view';

export default class KBConverterPlugin extends Plugin {
	settings: KBConverterSettings;
	logger: Logger;

	async onload() {
		await this.loadSettings();

		// Initialize logger
		this.logger = new Logger(this.app);
		this.logger.info('KB Converter plugin loading...');

		// Register the DOCX view for inline preview
		this.registerView(DOCX_VIEW_TYPE, (leaf) => new DocxView(leaf, this));

		// Register .docx extension to use our view
		this.registerExtensions(['docx'], DOCX_VIEW_TYPE);

		// Add command: Export current note to DOCX
		this.addCommand({
			id: 'export-to-docx',
			name: 'Export current note to DOCX',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file?.extension === 'md') {
					if (!checking) {
						this.exportToDocx(file);
					}
					return true;
				}
				return false;
			}
		});

		// Add command: Convert DOCX to Markdown (file picker)
		this.addCommand({
			id: 'import-docx',
			name: 'Import DOCX file to Markdown',
			callback: () => {
				this.importDocx();
			}
		});

		// Add command: Clear log file
		this.addCommand({
			id: 'clear-log',
			name: 'Clear KB Converter log file',
			callback: () => {
				this.logger.clear();
				new Notice('Log file cleared');
			}
		});

		// Register file menu for .md files (export)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Export to DOCX')
							.setIcon('file-output')
							.onClick(() => this.exportToDocx(file));
					});
				}
			})
		);

		// Register file menu for .docx files (import/convert)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'docx') {
					menu.addItem((item) => {
						item
							.setTitle('Convert to Markdown')
							.setIcon('file-input')
							.onClick(() => this.convertDocxFromVault(file));
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new KBConverterSettingTab(this.app, this));

		this.logger.info('KB Converter plugin loaded successfully');
	}

	onunload() {
		console.log('KB Converter plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async exportToDocx(file: TFile) {
		this.logger.info(`Export to DOCX initiated: ${file.path}`);
		new Notice(`Exporting ${file.name} to DOCX...`);

		try {
			// Read markdown content
			this.logger.debug('Reading markdown content...');
			const content = await this.app.vault.read(file);
			this.logger.debug(`Content length: ${content.length} chars`);

			// 1. Parse markdown with remark (includes callout transformation)
			const ast = parseMarkdown(content, {
				removeWikiLinks: this.settings.wikiLinkBehavior === 'remove',
				convertWikiLinksToText: this.settings.wikiLinkBehavior === 'convert-to-text'
			});

			// 2. Generate DOCX
			const imageResolver = new VaultImageResolver(this.app);
			const generator = new DocxGenerator(this.settings, imageResolver);
			const docxBuffer = await generator.generate(ast);

			// 3. Determine output path
			let outputPath: string;
			if (this.settings.outputDirectory === 'custom' && this.settings.customOutputPath) {
				const outputDir = this.settings.customOutputPath;
				// Ensure directory exists
				if (!await this.app.vault.adapter.exists(outputDir)) {
					await this.app.vault.createFolder(outputDir);
				}
				outputPath = `${outputDir}/${file.basename}.docx`;
			} else {
				// Same folder as source
				const folder = file.parent?.path || '';
				outputPath = folder ? `${folder}/${file.basename}.docx` : `${file.basename}.docx`;
			}

			// 4. Save the DOCX file
			await this.app.vault.adapter.writeBinary(outputPath, Buffer.from(docxBuffer));

			new Notice(`Exported to ${outputPath}`);

		} catch (error) {
			console.error('Export failed:', error);
			new Notice(`Export failed: ${error.message}`);
		}
	}

	async importDocx() {
		this.logger.info('Import DOCX initiated (file picker)');

		// Create file input element
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.docx';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				this.logger.warn('No file selected');
				return;
			}

			this.logger.info(`File selected: ${file.name}, size: ${file.size} bytes`);
			new Notice(`Importing ${file.name}...`);

			try {
				// Read the file as ArrayBuffer
				this.logger.debug('Reading file as ArrayBuffer...');
				const buffer = await file.arrayBuffer();
				this.logger.debug(`File read complete, buffer size: ${buffer.byteLength}`);

				const basename = file.name.replace(/\.docx$/i, '');

				// Convert DOCX to Markdown
				const converter = new DocxToMdConverter(this.logger);
				const result = await converter.convert(buffer, basename);

				// Determine output location
				const activeFile = this.app.workspace.getActiveFile();
				const outputFolder = activeFile?.parent?.path || '';
				this.logger.info(`Output folder: ${outputFolder || '(vault root)'}`);

				// Save result
				await this.saveConversionResult(result, basename, outputFolder);

			} catch (error) {
				this.logger.error('Import failed', error);
				new Notice(`Import failed: ${error.message}`);
			}
		};

		// Trigger file picker
		input.click();
	}

	/**
	 * Convert a .docx file that exists in the vault
	 */
	async convertDocxFromVault(file: TFile) {
		this.logger.info(`Converting DOCX from vault: ${file.path}`);
		new Notice(`Converting ${file.name}...`);

		try {
			// Read the file from vault
			this.logger.debug('Reading DOCX from vault...');
			const buffer = await this.app.vault.readBinary(file);
			this.logger.debug(`File read complete, size: ${buffer.byteLength} bytes`);

			const basename = file.basename;
			const outputFolder = file.parent?.path || '';

			// Convert DOCX to Markdown
			const converter = new DocxToMdConverter(this.logger);
			const imageHandling = this.settings.importSettings.imageHandling;
			const result = await converter.convert(buffer, basename, imageHandling);

			// Save result
			await this.saveConversionResult(result, basename, outputFolder);

			// Delete source if enabled
			if (this.settings.importSettings.deleteSourceAfterConversion) {
				await this.app.vault.delete(file);
				this.logger.info(`Deleted source file: ${file.path}`);
			}

		} catch (error) {
			this.logger.error('Conversion failed', error);
			new Notice(`Conversion failed: ${error.message}`);
		}
	}

	/**
	 * Compute the assets folder path based on settings
	 */
	private computeAssetsFolder(basename: string, outputFolder: string): string {
		const importSettings = this.settings.importSettings;

		let assetsFolder: string;

		switch (importSettings.assetsLocation) {
			case 'same':
				// Images go in same folder as markdown
				assetsFolder = outputFolder;
				break;
			case 'custom':
				// Images go to a custom vault folder
				assetsFolder = importSettings.customAssetsPath;
				if (importSettings.createDocumentSubfolder) {
					assetsFolder = `${assetsFolder}/${basename}`;
				}
				break;
			case 'subfolder':
			default:
				// Images go to a subfolder next to markdown
				const folderName = importSettings.assetsFolderName || '_assets';
				if (outputFolder) {
					assetsFolder = `${outputFolder}/${folderName}`;
				} else {
					assetsFolder = folderName;
				}
				if (importSettings.createDocumentSubfolder) {
					assetsFolder = `${assetsFolder}/${basename}`;
				}
				break;
		}

		return assetsFolder;
	}

	/**
	 * Format an image link based on settings
	 */
	private formatImageLink(filename: string, assetsFolder: string, outputFolder: string): string {
		const importSettings = this.settings.importSettings;

		switch (importSettings.imageLinkFormat) {
			case 'markdown-absolute':
				// Absolute path from vault root
				const absolutePath = assetsFolder ? `${assetsFolder}/${filename}` : filename;
				return `![](/${absolutePath})`;
			case 'markdown-relative':
				// Relative path from markdown file location
				let relativePath: string;
				if (importSettings.assetsLocation === 'same') {
					relativePath = `./${filename}`;
				} else if (importSettings.assetsLocation === 'custom') {
					// Need to compute relative path from outputFolder to custom path
					// For simplicity, use absolute-style relative path
					relativePath = assetsFolder ? `./${assetsFolder}/${filename}` : `./${filename}`;
				} else {
					// subfolder - relative to markdown location
					const folderName = importSettings.assetsFolderName || '_assets';
					if (importSettings.createDocumentSubfolder) {
						relativePath = `./${folderName}/${filename.split('-')[0]}/${filename}`;
					} else {
						relativePath = `./${folderName}/${filename}`;
					}
				}
				return `![](${relativePath})`;
			case 'wikilink':
			default:
				// Obsidian wiki-link format
				return `![[${filename}]]`;
		}
	}

	/**
	 * Save conversion result (markdown + images) to vault
	 */
	async saveConversionResult(
		result: { markdown: string; images: Array<{ filename: string; data: ArrayBuffer; contentType: string }> },
		basename: string,
		outputFolder: string
	) {
		this.logger.info(`Saving conversion result for ${basename}`);

		// Compute assets folder based on settings
		const assetsFolder = this.computeAssetsFolder(basename, outputFolder);
		this.logger.debug(`Assets folder: ${assetsFolder}`);

		if (result.images.length > 0) {
			this.logger.info(`Saving ${result.images.length} images to ${assetsFolder}`);

			// Ensure assets folder exists
			const normalizedAssetsPath = normalizePath(assetsFolder);
			if (!await this.app.vault.adapter.exists(normalizedAssetsPath)) {
				await this.app.vault.createFolder(normalizedAssetsPath);
				this.logger.debug(`Created assets folder: ${normalizedAssetsPath}`);
			}

			// Save all images
			for (const image of result.images) {
				const imagePath = normalizePath(`${assetsFolder}/${image.filename}`);
				await this.app.vault.adapter.writeBinary(
					imagePath,
					Buffer.from(image.data)
				);
				this.logger.debug(`Saved image: ${imagePath}`);
			}

			new Notice(`Extracted ${result.images.length} images to ${assetsFolder}`);
		}

		// Transform image links based on settings
		let markdown = result.markdown;
		if (this.settings.importSettings.imageLinkFormat !== 'wikilink') {
			this.logger.debug('Transforming image links to non-wikilink format');
			for (const image of result.images) {
				const wikiLink = `![[${image.filename}]]`;
				const newLink = this.formatImageLink(image.filename, assetsFolder, outputFolder);
				markdown = markdown.replace(wikiLink, newLink);
				this.logger.debug(`Replaced ${wikiLink} with ${newLink}`);
			}
		}

		// Insert source callout if enabled
		if (this.settings.importSettings.insertSourceCallout) {
			const imageInfo = result.images.length > 0
				? { count: result.images.length, path: assetsFolder }
				: null;
			const sourceCallout = this.createSourceCallout(basename, outputFolder, imageInfo);
			markdown = sourceCallout + '\n\n' + markdown;
			this.logger.debug('Inserted source callout');
		}

		// Auto-apply template if enabled
		if (this.settings.importSettings.autoApplyTemplate) {
			const templateContent = await this.getTemplateForFilename(basename);
			if (templateContent) {
				// Remove Templater syntax from template (we're not running Templater)
				const cleanedTemplate = this.cleanTemplaterSyntax(templateContent);
				markdown = cleanedTemplate + '\n\n---\n\n## Imported Content\n\n' + markdown;
				this.logger.info(`Applied template based on filename: ${basename}`);
			}
		}

		// Save the markdown file
		const mdPath = normalizePath(
			outputFolder ? `${outputFolder}/${basename}.md` : `${basename}.md`
		);

		this.logger.info(`Saving markdown to ${mdPath}`);

		// Check if file already exists
		if (await this.app.vault.adapter.exists(mdPath)) {
			this.logger.warn(`File already exists: ${mdPath}, will overwrite`);
			const existingFile = this.app.vault.getAbstractFileByPath(mdPath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, markdown);
			}
		} else {
			await this.app.vault.create(mdPath, markdown);
		}

		// Open the new file
		const newFile = this.app.vault.getAbstractFileByPath(mdPath);
		if (newFile instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(newFile);
		}

		new Notice(`Converted to ${mdPath}`);
		this.logger.info(`Conversion complete: ${mdPath}`);

		// Check if Templater is available and trigger it
		await this.triggerTemplater(mdPath);
	}

	/**
	 * Attempt to trigger Templater plugin if installed
	 */
	async triggerTemplater(filePath: string) {
		// @ts-ignore - accessing internal plugins
		const templater = this.app.plugins?.plugins?.['templater-obsidian'];

		if (templater?.templater) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					// Templater API: replace templates in file
					await templater.templater.overwrite_file_commands(file);
					console.log('Templater processed the file');
				}
			} catch (error) {
				console.log('Templater processing skipped:', error.message);
			}
		}
	}

	/**
	 * Find an image file anywhere in the vault by filename
	 */
	async findImage(filename: string): Promise<TFile | null> {
		const files = this.app.vault.getFiles();
		return files.find(f => f.name === filename) || null;
	}

	/**
	 * Get the binary content of an image file
	 */
	async getImageBuffer(file: TFile): Promise<ArrayBuffer> {
		return await this.app.vault.readBinary(file);
	}

	/**
	 * Create source callout for imported document
	 */
	private createSourceCallout(
		basename: string,
		outputFolder: string,
		imageInfo: { count: number; path: string } | null
	): string {
		const importSettings = this.settings.importSettings;
		const calloutType = importSettings.sourceCalloutType || 'note';
		const calloutTitle = importSettings.sourceCalloutTitle || 'Source Document';

		// Build image line
		let imageLine: string;
		if (imageInfo) {
			const relativePath = imageInfo.path.startsWith(outputFolder)
				? './' + imageInfo.path.slice(outputFolder.length + 1)
				: imageInfo.path;
			imageLine = `> **Images**: ${imageInfo.count} extracted to \`${relativePath}\``;
		} else {
			imageLine = `> **Images**: No images extracted`;
		}

		// Build the callout
		const lines = [
			`> [!${calloutType}] ${calloutTitle}`,
			`> This note was converted from a DOCX file.`,
			`> **Local**: [[${basename}.docx]]`,
			`> **SharePoint**: `,
			imageLine
		];

		return lines.join('\n');
	}

	/**
	 * Detect template type from filename and return template content
	 */
	private async getTemplateForFilename(basename: string): Promise<string | null> {
		const lowerName = basename.toLowerCase();
		const { templateBasePath, templateNames } = this.settings.importSettings;

		let templateName: string | null = null;

		// Check for keywords in filename
		if (lowerName.includes('how-to') || lowerName.includes('howto') || lowerName.includes('how to')) {
			templateName = templateNames.howto;
			this.logger.debug(`Detected How-To template for: ${basename}`);
		} else if (lowerName.includes('procedure')) {
			templateName = templateNames.procedure;
			this.logger.debug(`Detected Procedure template for: ${basename}`);
		} else if (lowerName.includes('runbook')) {
			templateName = templateNames.runbook;
			this.logger.debug(`Detected Runbook template for: ${basename}`);
		}

		if (!templateName) {
			this.logger.debug(`No template match for filename: ${basename}`);
			return null;
		}

		const templatePath = `${templateBasePath}/${templateName}`;

		// Try to read the template file
		try {
			const normalizedPath = normalizePath(templatePath);
			if (await this.app.vault.adapter.exists(normalizedPath)) {
				const content = await this.app.vault.adapter.read(normalizedPath);
				return content;
			} else {
				this.logger.warn(`Template file not found: ${normalizedPath}`);
				return null;
			}
		} catch (error) {
			this.logger.error(`Failed to read template: ${templatePath}`, error);
			return null;
		}
	}

	/**
	 * Remove Templater syntax from template content
	 * Since we're not running Templater, we need to clean out the <% %> tags
	 */
	private cleanTemplaterSyntax(content: string): string {
		// Remove Templater execution blocks <%* ... %>
		content = content.replace(/<%\*[\s\S]*?%>/g, '');

		// Replace simple output blocks <%= ... %> with placeholder text
		content = content.replace(/<%=\s*tp\.file\.title\s*%>/g, '[Title]');
		content = content.replace(/<%=\s*tp\.date\.now\([^)]*\)\s*%>/g, new Date().toISOString().split('T')[0]);

		// Replace prompt blocks with placeholder
		content = content.replace(/<%\s*tp\.system\.prompt\([^)]*\)\s*%>/g, '[Enter value]');
		content = content.replace(/<%\s*tp\.system\.prompt\([^)]*,\s*"([^"]*)"\)\s*%>/g, '$1');

		// Replace cursor blocks
		content = content.replace(/<%\s*tp\.file\.cursor\([^)]*\)\s*%>/g, '');
		content = content.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/g, '');

		// Replace user variables with placeholder
		content = content.replace(/<%\s*tp\.user\.\w+\s*\?\?\s*"([^"]*)"\s*%>/g, '$1');

		// Remove any remaining Templater blocks
		content = content.replace(/<%[^%]*%>/g, '');

		// Clean up any double blank lines created by removals
		content = content.replace(/\n{3,}/g, '\n\n');

		return content;
	}
}
