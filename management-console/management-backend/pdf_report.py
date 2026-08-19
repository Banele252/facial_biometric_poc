"""Renders the "Trust Platform activity report" PDF from a ReportContext
and the agent's narrative.

reportlab chosen over fpdf2/weasyprint/pdfkit: pure-Python wheel, no
system-level Pango/Cairo/wkhtmltopdf dependency, so
management-console/Dockerfile's slim runtime image needs no changes.
"""

from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from report_agent import ReportNarrative
from report_data import ReportContext

_TITLE = "Trust Platform activity report"


def build_pdf(context: ReportContext, narrative: ReportNarrative) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title=_TITLE,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(_TITLE, styles["Title"]),
        Spacer(1, 0.4 * cm),
    ]

    txn = context.transaction
    summary_rows = [
        ["Transaction ID", str(txn["id"])],
        ["ID number", str(txn["id_number"])],
        ["MSISDN", str(txn["msisdn"])],
        ["Transaction kind", str(txn["transaction_kind"])],
        ["Status", str(txn["status"])],
        ["Timestamp", str(txn["created_at"])],
    ]
    summary_table = Table(summary_rows, colWidths=[5 * cm, 10 * cm])
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f2f2f2")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story += [summary_table, Spacer(1, 0.6 * cm)]

    story += [
        Paragraph("Executive summary", styles["Heading2"]),
        Paragraph(narrative.executive_summary, styles["BodyText"]),
        Spacer(1, 0.4 * cm),
        Paragraph("Process detail", styles["Heading2"]),
        Paragraph(narrative.process_narrative.replace("\n", "<br/>"), styles["BodyText"]),
        Spacer(1, 0.3 * cm),
    ]

    if context.checks:
        check_rows = [["Check", "Status", "Detail"]]
        for c in context.checks:
            check_rows.append(
                [str(c.get("label", c.get("name", ""))), str(c.get("status", "")), str(c.get("detail", ""))]
            )
        check_table = Table(check_rows, colWidths=[4 * cm, 2.5 * cm, 8.5 * cm])
        check_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6e6e6")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story += [check_table, Spacer(1, 0.5 * cm)]

    story += [
        Paragraph("Conclusion", styles["Heading2"]),
        Paragraph(narrative.conclusion, styles["BodyText"]),
    ]

    doc.build(story)
    return buffer.getvalue()
