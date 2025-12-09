import {
	Paragraph,
	TextRun,
	BorderStyle,
	ShadingType,
	AlignmentType
} from 'docx';
import { Callout } from '../parsers/callout-plugin';
import { CalloutStyle } from '../settings';

const DEFAULT_CALLOUT_STYLE: CalloutStyle = {
	background: 'E8F4FD',
	border: '4A90E2',
	leftBorderWidth: 12
};

/**
 * Create styled paragraphs for a callout box
 *
 * Port of Python's style_callout_block() from kb-convert.py
 */
export function createCalloutParagraphs(
	callout: Callout,
	styles: { [type: string]: CalloutStyle }
): Paragraph[] {
	const style = styles[callout.calloutType] || DEFAULT_CALLOUT_STYLE;
	const paragraphs: Paragraph[] = [];

	// Create header paragraph with callout type and title
	const headerText = callout.title
		? `${capitalize(callout.calloutType)}: ${callout.title}`
		: `${capitalize(callout.calloutType)}:`;

	paragraphs.push(createCalloutParagraph(
		[new TextRun({ text: headerText, bold: true })],
		style,
		true  // isFirst
	));

	// Create content paragraphs
	for (let i = 0; i < callout.children.length; i++) {
		const child = callout.children[i];
		const isLast = i === callout.children.length - 1;

		if (child.type === 'paragraph') {
			const runs = child.children.map(node => {
				if (node.type === 'text') {
					return new TextRun({ text: node.value });
				} else if (node.type === 'strong') {
					const text = extractText(node);
					return new TextRun({ text, bold: true });
				} else if (node.type === 'emphasis') {
					const text = extractText(node);
					return new TextRun({ text, italics: true });
				} else if (node.type === 'inlineCode') {
					return new TextRun({
						text: node.value,
						font: 'Courier New',
						size: 18  // 9pt
					});
				}
				return new TextRun({ text: '' });
			});

			paragraphs.push(createCalloutParagraph(runs, style, false, isLast));
		}
	}

	return paragraphs;
}

function createCalloutParagraph(
	children: TextRun[],
	style: CalloutStyle,
	isFirst: boolean = false,
	isLast: boolean = false
): Paragraph {
	// Convert half-points to eighths of a point (docx library units)
	// leftBorderWidth is in half-points in our config, docx border size is eighths of a point
	const leftBorderSize = style.leftBorderWidth * 4;  // 12 half-pt = 48 eighths
	const otherBorderSize = 16;  // 4 half-pt = 0.5pt = 16 eighths

	return new Paragraph({
		children,
		shading: {
			type: ShadingType.SOLID,
			color: style.background
		},
		border: {
			left: {
				style: BorderStyle.SINGLE,
				size: leftBorderSize,
				color: style.border
			},
			top: {
				style: BorderStyle.SINGLE,
				size: otherBorderSize,
				color: style.border
			},
			right: {
				style: BorderStyle.SINGLE,
				size: otherBorderSize,
				color: style.border
			},
			bottom: {
				style: BorderStyle.SINGLE,
				size: otherBorderSize,
				color: style.border
			}
		},
		spacing: {
			before: 120,  // 6pt
			after: 120    // 6pt
		},
		indent: {
			left: 240,   // 12pt in twips
			right: 240
		}
	});
}

function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractText(node: any): string {
	if (node.type === 'text') {
		return node.value;
	}
	if (node.children) {
		return node.children.map(extractText).join('');
	}
	return '';
}
