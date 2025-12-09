import { App, PluginSettingTab, Setting } from 'obsidian';
import KBConverterPlugin from './main';

export interface CalloutStyle {
	background: string;  // Hex color without #
	border: string;      // Hex color without #
	leftBorderWidth: number;  // In half-points (12 = 1.5pt)
}

export interface CodeBlockStyle {
	background: string;
	borderColor: string;
	fontName: string;
	fontSize: number;
}

export interface TableStyle {
	headerBackground: string;
	headerTextColor: string;
	borderColor: string;
}

export interface ImportSettings {
	// Image handling mode
	imageHandling: 'extract' | 'embed' | 'ignore';
	// Where to put extracted images (only used when imageHandling is 'extract')
	assetsLocation: 'subfolder' | 'same' | 'custom';
	// Custom assets folder path (relative to vault root)
	customAssetsPath: string;
	// Folder name for assets (used with 'subfolder' option)
	assetsFolderName: string;
	// Whether to create a subfolder per document
	createDocumentSubfolder: boolean;
	// Image link format in markdown
	imageLinkFormat: 'wikilink' | 'markdown-relative' | 'markdown-absolute';
	// Delete source DOCX after conversion
	deleteSourceAfterConversion: boolean;

	// Source callout settings
	insertSourceCallout: boolean;
	sourceCalloutType: string;  // note, info, etc.
	sourceCalloutTitle: string;

	// Template auto-apply settings
	autoApplyTemplate: boolean;
	templatePaths: {
		howto: string;
		procedure: string;
		runbook: string;
	};
}

export interface KBConverterSettings {
	// Output preferences (export)
	outputDirectory: 'same' | 'custom';
	customOutputPath: string;

	// Import preferences
	importSettings: ImportSettings;

	// Callout styling
	calloutStyles: {
		[type: string]: CalloutStyle;
	};

	// Code block styling
	codeBlockStyle: CodeBlockStyle;

	// Table styling
	tableStyle: TableStyle;

	// Wiki-link handling
	wikiLinkBehavior: 'remove' | 'convert-to-text';
}

export const DEFAULT_SETTINGS: KBConverterSettings = {
	outputDirectory: 'same',
	customOutputPath: '',

	importSettings: {
		imageHandling: 'extract',
		assetsLocation: 'subfolder',
		customAssetsPath: 'attachments',
		assetsFolderName: '_assets',
		createDocumentSubfolder: true,
		imageLinkFormat: 'wikilink',
		deleteSourceAfterConversion: false,

		// Source callout
		insertSourceCallout: true,
		sourceCalloutType: 'note',
		sourceCalloutTitle: 'Source Document',

		// Template auto-apply
		autoApplyTemplate: false,
		templatePaths: {
			howto: '000 Workings/20 Templates/22 Professional/22.10 AMS Documentation/TPL - How-To.md',
			procedure: '000 Workings/20 Templates/22 Professional/22.10 AMS Documentation/TPL - Procedure.md',
			runbook: '000 Workings/20 Templates/22 Professional/22.10 AMS Documentation/TPL - Runbook.md'
		}
	},

	calloutStyles: {
		note: {
			background: 'E8F4FD',
			border: '4A90E2',
			leftBorderWidth: 12
		},
		tip: {
			background: 'E8F5E9',
			border: '4CAF50',
			leftBorderWidth: 12
		},
		warning: {
			background: 'FFF3E0',
			border: 'FF9800',
			leftBorderWidth: 12
		},
		danger: {
			background: 'FFEBEE',
			border: 'F44336',
			leftBorderWidth: 12
		},
		info: {
			background: 'E1F5FE',
			border: '00BCD4',
			leftBorderWidth: 12
		},
		question: {
			background: 'F3E5F5',
			border: '9C27B0',
			leftBorderWidth: 12
		}
	},

	codeBlockStyle: {
		background: 'F5F5F5',
		borderColor: 'CCCCCC',
		fontName: 'Consolas',  // Company template uses Consolas
		fontSize: 11           // 11pt to match template
	},

	tableStyle: {
		headerBackground: '404040',
		headerTextColor: 'FFFFFF',
		borderColor: '000000'
	},

	wikiLinkBehavior: 'remove'
};

export class KBConverterSettingTab extends PluginSettingTab {
	plugin: KBConverterPlugin;

	constructor(app: App, plugin: KBConverterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'KB Converter Settings' });

		// Output Directory
		containerEl.createEl('h3', { text: 'Output' });

		new Setting(containerEl)
			.setName('Output directory')
			.setDesc('Where to save exported DOCX files')
			.addDropdown(dropdown => {
				dropdown
					.addOption('same', 'Same folder as source')
					.addOption('custom', 'Custom folder')
					.setValue(this.plugin.settings.outputDirectory)
					.onChange(async (value: 'same' | 'custom') => {
						this.plugin.settings.outputDirectory = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh to show/hide custom path
					});
			});

		if (this.plugin.settings.outputDirectory === 'custom') {
			new Setting(containerEl)
				.setName('Custom output path')
				.setDesc('Path relative to vault root')
				.addText(text => {
					text
						.setPlaceholder('exports/')
						.setValue(this.plugin.settings.customOutputPath)
						.onChange(async (value) => {
							this.plugin.settings.customOutputPath = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Wiki-link behavior
		new Setting(containerEl)
			.setName('Wiki-link handling')
			.setDesc('How to handle [[wiki-links]] when exporting')
			.addDropdown(dropdown => {
				dropdown
					.addOption('remove', 'Remove entirely')
					.addOption('convert-to-text', 'Convert to plain text')
					.setValue(this.plugin.settings.wikiLinkBehavior)
					.onChange(async (value: 'remove' | 'convert-to-text') => {
						this.plugin.settings.wikiLinkBehavior = value;
						await this.plugin.saveSettings();
					});
			});

		// Import Settings
		containerEl.createEl('h3', { text: 'Import Settings (DOCX → Markdown)' });

		new Setting(containerEl)
			.setName('Delete source after conversion')
			.setDesc('Automatically delete the DOCX file after converting to Markdown')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.importSettings.deleteSourceAfterConversion)
					.onChange(async (value) => {
						this.plugin.settings.importSettings.deleteSourceAfterConversion = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Image handling')
			.setDesc('How to handle images in DOCX files')
			.addDropdown(dropdown => {
				dropdown
					.addOption('extract', 'Extract to files')
					.addOption('embed', 'Embed as base64')
					.addOption('ignore', 'Ignore images')
					.setValue(this.plugin.settings.importSettings.imageHandling)
					.onChange(async (value: 'extract' | 'embed' | 'ignore') => {
						this.plugin.settings.importSettings.imageHandling = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Only show asset location settings when extracting images
		if (this.plugin.settings.importSettings.imageHandling === 'extract') {
			new Setting(containerEl)
				.setName('Assets location')
				.setDesc('Where to save extracted images')
				.addDropdown(dropdown => {
					dropdown
						.addOption('subfolder', 'Subfolder next to markdown')
						.addOption('same', 'Same folder as markdown')
						.addOption('custom', 'Custom vault folder')
						.setValue(this.plugin.settings.importSettings.assetsLocation)
						.onChange(async (value: 'subfolder' | 'same' | 'custom') => {
							this.plugin.settings.importSettings.assetsLocation = value;
							await this.plugin.saveSettings();
							this.display();
						});
				});

			if (this.plugin.settings.importSettings.assetsLocation === 'subfolder') {
				new Setting(containerEl)
					.setName('Assets folder name')
					.setDesc('Name of the assets folder (e.g., _assets, images, attachments)')
					.addText(text => {
						text
							.setPlaceholder('_assets')
							.setValue(this.plugin.settings.importSettings.assetsFolderName)
							.onChange(async (value) => {
								this.plugin.settings.importSettings.assetsFolderName = value || '_assets';
								await this.plugin.saveSettings();
							});
					});
			}

			if (this.plugin.settings.importSettings.assetsLocation === 'custom') {
				new Setting(containerEl)
					.setName('Custom assets path')
					.setDesc('Path relative to vault root (e.g., attachments, media/images)')
					.addText(text => {
						text
							.setPlaceholder('attachments')
							.setValue(this.plugin.settings.importSettings.customAssetsPath)
							.onChange(async (value) => {
								this.plugin.settings.importSettings.customAssetsPath = value;
								await this.plugin.saveSettings();
							});
					});
			}

			if (this.plugin.settings.importSettings.assetsLocation !== 'same') {
				new Setting(containerEl)
					.setName('Create document subfolder')
					.setDesc('Create a subfolder for each document (e.g., _assets/MyDoc/image.png)')
					.addToggle(toggle => {
						toggle
							.setValue(this.plugin.settings.importSettings.createDocumentSubfolder)
							.onChange(async (value) => {
								this.plugin.settings.importSettings.createDocumentSubfolder = value;
								await this.plugin.saveSettings();
							});
					});
			}

			new Setting(containerEl)
				.setName('Image link format')
				.setDesc('Format for image links in converted markdown')
				.addDropdown(dropdown => {
					dropdown
						.addOption('wikilink', 'Wiki-link: ![[image.png]]')
						.addOption('markdown-relative', 'Markdown relative: ![](./path/image.png)')
						.addOption('markdown-absolute', 'Markdown absolute: ![](/path/image.png)')
						.setValue(this.plugin.settings.importSettings.imageLinkFormat)
						.onChange(async (value: 'wikilink' | 'markdown-relative' | 'markdown-absolute') => {
							this.plugin.settings.importSettings.imageLinkFormat = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Source Callout Settings
		containerEl.createEl('h4', { text: 'Source Document Callout' });

		new Setting(containerEl)
			.setName('Insert source callout')
			.setDesc('Add a callout indicating the original DOCX source file')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.importSettings.insertSourceCallout)
					.onChange(async (value) => {
						this.plugin.settings.importSettings.insertSourceCallout = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.importSettings.insertSourceCallout) {
			new Setting(containerEl)
				.setName('Callout type')
				.setDesc('Type of callout to use (note, info, tip, etc.)')
				.addText(text => {
					text
						.setPlaceholder('note')
						.setValue(this.plugin.settings.importSettings.sourceCalloutType)
						.onChange(async (value) => {
							this.plugin.settings.importSettings.sourceCalloutType = value || 'note';
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '100px';
				});

			new Setting(containerEl)
				.setName('Callout title')
				.setDesc('Title for the source callout')
				.addText(text => {
					text
						.setPlaceholder('Source Document')
						.setValue(this.plugin.settings.importSettings.sourceCalloutTitle)
						.onChange(async (value) => {
							this.plugin.settings.importSettings.sourceCalloutTitle = value || 'Source Document';
							await this.plugin.saveSettings();
						});
				});
		}

		// Template Auto-Apply Settings
		containerEl.createEl('h4', { text: 'Template Auto-Apply' });

		new Setting(containerEl)
			.setName('Auto-apply template')
			.setDesc('Automatically prepend template based on filename keywords (How-To, Procedure, Runbook)')
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.importSettings.autoApplyTemplate)
					.onChange(async (value) => {
						this.plugin.settings.importSettings.autoApplyTemplate = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.importSettings.autoApplyTemplate) {
			new Setting(containerEl)
				.setName('How-To template path')
				.setDesc('Path to How-To template (relative to vault root)')
				.addText(text => {
					text
						.setValue(this.plugin.settings.importSettings.templatePaths.howto)
						.onChange(async (value) => {
							this.plugin.settings.importSettings.templatePaths.howto = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Procedure template path')
				.setDesc('Path to Procedure template (relative to vault root)')
				.addText(text => {
					text
						.setValue(this.plugin.settings.importSettings.templatePaths.procedure)
						.onChange(async (value) => {
							this.plugin.settings.importSettings.templatePaths.procedure = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Runbook template path')
				.setDesc('Path to Runbook template (relative to vault root)')
				.addText(text => {
					text
						.setValue(this.plugin.settings.importSettings.templatePaths.runbook)
						.onChange(async (value) => {
							this.plugin.settings.importSettings.templatePaths.runbook = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Callout Styles
		containerEl.createEl('h3', { text: 'Callout Styles' });
		containerEl.createEl('p', {
			text: 'Customize colors for each callout type. Colors are hex values without #.',
			cls: 'setting-item-description'
		});

		const calloutTypes = ['note', 'tip', 'warning', 'danger', 'info', 'question'];

		for (const type of calloutTypes) {
			const style = this.plugin.settings.calloutStyles[type];

			new Setting(containerEl)
				.setName(`${type.charAt(0).toUpperCase() + type.slice(1)} callout`)
				.addText(text => {
					text
						.setPlaceholder('Background')
						.setValue(style.background)
						.onChange(async (value) => {
							this.plugin.settings.calloutStyles[type].background = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '80px';
					text.inputEl.title = 'Background color';
				})
				.addText(text => {
					text
						.setPlaceholder('Border')
						.setValue(style.border)
						.onChange(async (value) => {
							this.plugin.settings.calloutStyles[type].border = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '80px';
					text.inputEl.title = 'Border color';
				});
		}

		// Code Block Styles
		containerEl.createEl('h3', { text: 'Code Block Styles' });

		new Setting(containerEl)
			.setName('Font')
			.setDesc('Monospace font for code blocks')
			.addText(text => {
				text
					.setValue(this.plugin.settings.codeBlockStyle.fontName)
					.onChange(async (value) => {
						this.plugin.settings.codeBlockStyle.fontName = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Font size in points')
			.addText(text => {
				text
					.setValue(String(this.plugin.settings.codeBlockStyle.fontSize))
					.onChange(async (value) => {
						const size = parseInt(value);
						if (!isNaN(size) && size > 0) {
							this.plugin.settings.codeBlockStyle.fontSize = size;
							await this.plugin.saveSettings();
						}
					});
				text.inputEl.type = 'number';
				text.inputEl.style.width = '60px';
			});

		new Setting(containerEl)
			.setName('Background color')
			.setDesc('Hex color without #')
			.addText(text => {
				text
					.setValue(this.plugin.settings.codeBlockStyle.background)
					.onChange(async (value) => {
						this.plugin.settings.codeBlockStyle.background = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '80px';
			});

		// Table Styles
		containerEl.createEl('h3', { text: 'Table Styles' });

		new Setting(containerEl)
			.setName('Header background')
			.setDesc('Background color for table header row')
			.addText(text => {
				text
					.setValue(this.plugin.settings.tableStyle.headerBackground)
					.onChange(async (value) => {
						this.plugin.settings.tableStyle.headerBackground = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '80px';
			});

		new Setting(containerEl)
			.setName('Header text color')
			.setDesc('Text color for table header row')
			.addText(text => {
				text
					.setValue(this.plugin.settings.tableStyle.headerTextColor)
					.onChange(async (value) => {
						this.plugin.settings.tableStyle.headerTextColor = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '80px';
			});
	}
}
