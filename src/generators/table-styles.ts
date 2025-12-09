import {
	Table,
	TableRow,
	TableCell,
	Paragraph,
	TextRun,
	WidthType,
	BorderStyle,
	ShadingType,
	AlignmentType
} from 'docx';
import { Table as MdTable } from 'mdast';
import { TableStyle } from '../settings';

/**
 * Create a styled table from markdown AST
 *
 * Port of Python's table formatting from kb-convert.py lines 360-391
 * - Borders on all cells
 * - Header row: dark gray background, white bold text
 */
export function createStyledTable(node: MdTable, style: TableStyle): Table {
	const rows: TableRow[] = [];

	for (let rowIndex = 0; rowIndex < node.children.length; rowIndex++) {
		const mdRow = node.children[rowIndex];
		const isHeader = rowIndex === 0;
		const cells: TableCell[] = [];

		for (const mdCell of mdRow.children) {
			const cellContent = extractCellText(mdCell);

			const cell = new TableCell({
				children: [
					new Paragraph({
						children: [
							new TextRun({
								text: cellContent,
								bold: isHeader,
								color: isHeader ? style.headerTextColor : undefined
							})
						],
						alignment: AlignmentType.LEFT
					})
				],
				shading: isHeader ? {
					type: ShadingType.SOLID,
					color: style.headerBackground
				} : undefined,
				borders: {
					top: { style: BorderStyle.SINGLE, size: 4, color: style.borderColor },
					bottom: { style: BorderStyle.SINGLE, size: 4, color: style.borderColor },
					left: { style: BorderStyle.SINGLE, size: 4, color: style.borderColor },
					right: { style: BorderStyle.SINGLE, size: 4, color: style.borderColor }
				}
			});

			cells.push(cell);
		}

		rows.push(new TableRow({ children: cells }));
	}

	return new Table({
		rows,
		width: {
			size: 100,
			type: WidthType.PERCENTAGE
		}
	});
}

function extractCellText(cell: any): string {
	if (!cell.children) return '';

	return cell.children.map((child: any) => {
		if (child.type === 'text') {
			return child.value;
		}
		if (child.type === 'paragraph') {
			return extractCellText(child);
		}
		if (child.children) {
			return extractCellText(child);
		}
		return '';
	}).join('');
}
