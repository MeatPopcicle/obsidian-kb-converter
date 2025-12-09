import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
import * as docxPreview from 'docx-preview';
import KBConverterPlugin from '../main';

export const DOCX_VIEW_TYPE = 'kb-docx-view';

export class DocxView extends FileView {
	plugin: KBConverterPlugin;
	previewContainer: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: KBConverterPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DOCX_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename || 'DOCX Preview';
	}

	async onLoadFile(file: TFile): Promise<void> {
		// Clear container
		this.contentEl.empty();

		// Create toolbar with buttons
		this.createToolbar();

		// Create preview container
		this.previewContainer = this.contentEl.createDiv({ cls: 'docx-preview-container' });

		// Render DOCX
		await this.renderDocx(file);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.contentEl.empty();
	}

	createToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: 'docx-preview-toolbar' });

		// Convert to Markdown button
		const convertBtn = toolbar.createEl('button', {
			text: 'Convert to Markdown',
			cls: 'docx-preview-btn'
		});
		convertBtn.onclick = () => this.convertToMarkdown();

		// Open externally button
		const openBtn = toolbar.createEl('button', {
			text: 'Open in External App',
			cls: 'docx-preview-btn docx-preview-btn-secondary'
		});
		openBtn.onclick = () => this.openExternally();
	}

	async renderDocx(file: TFile): Promise<void> {
		try {
			const buffer = await this.app.vault.readBinary(file);
			await docxPreview.renderAsync(buffer, this.previewContainer, null, {
				className: 'docx-preview-body',
				inWrapper: true,
				ignoreWidth: false,
				ignoreHeight: false,
				renderHeaders: true,
				renderFooters: true
			});
		} catch (error) {
			console.error('Failed to render DOCX:', error);
			this.previewContainer.createEl('div', {
				text: `Failed to render preview: ${error.message}`,
				cls: 'docx-preview-error'
			});
		}
	}

	async convertToMarkdown(): Promise<void> {
		if (this.file) {
			await this.plugin.convertDocxFromVault(this.file);
		}
	}

	openExternally(): void {
		if (this.file) {
			// Get absolute path and open with system default
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const fullPath = `${vaultPath}/${this.file.path}`;
			// @ts-ignore - electron is available in Obsidian desktop
			require('electron').shell.openPath(fullPath);
		}
	}
}
