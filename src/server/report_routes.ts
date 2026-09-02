import { Router } from 'express';
import { ReportRequest, ReportService } from '../core/reporting/report_service.ts';
import { AuditLogEntry, ProjectSession } from '../types/index.ts';

export const REPORT_RENDERER_ID = 'field-document-v2';

interface ReportRouteDependencies {
  getSession: () => ProjectSession;
  getAuditLogs: () => AuditLogEntry[];
  reportService?: ReportService;
}

/** The single production route boundary used by preview and every report export. */
export function createReportRouter(dependencies: ReportRouteDependencies) {
  const router = Router(), reportService = dependencies.reportService || new ReportService();
  router.post('/preview', (req, res) => {
    try { res.json(reportService.build(dependencies.getSession(), dependencies.getAuditLogs(), req.body as ReportRequest)); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Report preview failed.' }); }
  });
  router.post('/export/:format', (req, res) => {
    try {
      const model = reportService.build(dependencies.getSession(), dependencies.getAuditLogs(), req.body as ReportRequest), format = String(req.params.format).toLowerCase();
      if (format === 'pdf') {
        const data = reportService.pdf(model);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportService.filename(model, 'pdf')}"`);
        res.setHeader('X-CCTV-Report-Renderer', REPORT_RENDERER_ID);
        return res.send(data);
      }
      if (format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${reportService.filename(model, 'csv')}"`); return res.send(reportService.csv(model)); }
      if (format === 'json') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', `attachment; filename="${reportService.filename(model, 'json')}"`); return res.send(reportService.json(model)); }
      res.status(400).json({ error: 'Supported report formats are PDF, CSV, and JSON.' });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Report export failed.' }); }
  });
  return router;
}
