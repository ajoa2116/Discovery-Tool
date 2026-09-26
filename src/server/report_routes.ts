import {ReportSet} from '../core/reporting/report_set.ts';
import { Router } from 'express';
import { ReportRequest, ReportService } from '../core/reporting/report_service.ts';
import { AuditLogEntry, ProjectSession } from '../types/index.ts';
import { technicianErrorResponse } from '../shared/error_presentation.ts';

export const REPORT_RENDERER_ID = 'field-document-v2';

interface ReportRouteDependencies {
  getSession: () => ProjectSession;
  getAuditLogs: () => AuditLogEntry[];
  reportService?: ReportService;
  reportSet?: ReportSet;
}

/** The single production route boundary used by preview and every report export. */
export function createReportRouter(dependencies: ReportRouteDependencies) {
  const router = Router(), reportService = dependencies.reportService || new ReportService();
  const build=(request:ReportRequest)=>{
    const fromSet=request.scope==='REPORT_SET';
    if(fromSet&&!dependencies.reportSet)throw Error('Report Set is unavailable.');
    const session=fromSet?dependencies.reportSet!.reportSession():dependencies.getSession();
    const model=reportService.build(session,fromSet?[]:dependencies.getAuditLogs(),request);
    if(fromSet)model.metadata.liveEvidence=dependencies.reportSet!.snapshot().members.every(m=>m.current&&m.device.sessionVerification==='VERIFIED');
    return model;
  };
  router.post('/preview', (req, res) => {
    try { res.json(build(req.body as ReportRequest)); }
    catch (error) { res.status(400).json(technicianErrorResponse(error,{operation:'REPORT_PREVIEW',fallbackCode:'REPORT_FAILED'})); }
  });
  router.post('/export/:format', (req, res) => {
    try {
      const model = build(req.body as ReportRequest), format = String(req.params.format).toLowerCase();
      res.locals.reportGeneration=model.generation;
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
    } catch (error) { res.status(400).json(technicianErrorResponse(error,{operation:'REPORT_EXPORT',fallbackCode:'REPORT_FAILED'})); }
  });
  return router;
}
