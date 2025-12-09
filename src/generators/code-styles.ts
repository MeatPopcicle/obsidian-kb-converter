import {
	Paragraph,
	TextRun,
	BorderStyle,
	ShadingType
} from 'docx';
import { Code } from 'mdast';
import { CodeBlockStyle } from '../settings';

/**
 * Create a styled code block paragraph
 *
 * Port of Python's format_code_block() from kb-convert.py lines 305-353
 * - Monospace font (Courier New)
 * - Light gray background
 * - Borders on all sides
 * - Padding and spacing
 */
export function createCodeBlock(node: Code, style: CodeBlockStyle): Paragraph {
	const lines = node.value.split('\n');

	// Create text runs for each line with line breaks between them
	const children: TextRun[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (i > 0) {
			children.push(new TextRun({ break: 1 }));
		}
		children.push(new TextRun({
			text: lines[i],
			font: style.fontName,
			size: style.fontSize * 2  // Size is in half-points
		}));
	}

	// Border size: config uses half-points, docx uses eighths of a point
	const borderSize = 16;  // 4 half-pt = 0.5pt

	return new Paragraph({
		children,
		shading: {
			type: ShadingType.SOLID,
			color: style.background
		},
		border: {
			top: { style: BorderStyle.SINGLE, size: borderSize, color: style.borderColor },
			bottom: { style: BorderStyle.SINGLE, size: borderSize, color: style.borderColor },
			left: { style: BorderStyle.SINGLE, size: borderSize, color: style.borderColor },
			right: { style: BorderStyle.SINGLE, size: borderSize, color: style.borderColor }
		},
		spacing: {
			before: 120,  // 6pt in twips
			after: 120
		},
		indent: {
			left: 120,   // 6pt padding
			right: 120
		}
	});
}
