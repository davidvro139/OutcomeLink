import type {
  CplMetric,
  ImprovementPlanStatus,
  ReportingPeriodStatus,
  ValidationSeverity,
} from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface AccreditationFramework {
  id: number;
  name: string;
  description: string | null;
}

export interface RuleSet {
  id: number;
  frameworkId: number;
  versionLabel: string;
  effectiveStartDate: string;
  ruleDefinition: { benchmarks: { completion: number; placement: number; licensure: number } };
}

export interface ReportingPeriod {
  id: number;
  ruleSetId: number;
  label: string;
  startDate: string;
  endDate: string;
  outcomesDeadline: string | null;
  status: ReportingPeriodStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
}

export interface CplResult {
  id: number;
  programId: number | null;
  metric: CplMetric;
  numerator: number;
  denominator: number;
  percentage: string;
  program: { id: number; name: string } | null;
}

export interface DrillDownStudent {
  student: { id: number; firstName: string; lastName: string };
  program: { id: number; name: string } | null;
  classificationCode: string;
  reasonText: string | null;
}

export interface StudentExplanation {
  metric: CplMetric;
  classificationCode: string;
  countsInNumerator: boolean;
  countsInDenominator: boolean;
  reasonText: string | null;
}

export interface ValidationIssue {
  id: number;
  studentId: number | null;
  programId: number | null;
  issueType: string;
  severity: ValidationSeverity;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  student: { id: number; firstName: string; lastName: string } | null;
  program: { id: number; name: string } | null;
}

export function useFrameworks() {
  return useQuery({
    queryKey: ["accreditation", "frameworks"],
    queryFn: () =>
      apiRequest<{ frameworks: AccreditationFramework[] }>("/api/accreditation/frameworks").then(
        (r) => r.frameworks,
      ),
  });
}

export function useCreateFramework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiRequest<{ framework: AccreditationFramework }>("/api/accreditation/frameworks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accreditation", "frameworks"] }),
  });
}

export function useRuleSets(frameworkId: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "frameworks", frameworkId, "rule-sets"],
    queryFn: () =>
      apiRequest<{ ruleSets: RuleSet[] }>(
        `/api/accreditation/frameworks/${frameworkId}/rule-sets`,
      ).then((r) => r.ruleSets),
    enabled: frameworkId !== undefined,
  });
}

// frameworkId travels with each mutate() call rather than being baked into
// the hook at render time — a caller that creates the framework and the rule
// set in the same handler (see ReportingPeriodsPage) needs the just-created
// framework's id, which a hook-level parameter would miss via a stale closure.
export function useCreateRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      frameworkId,
      ...input
    }: {
      frameworkId: number;
      versionLabel: string;
      effectiveStartDate: string;
      ruleDefinition: { benchmarks: { completion: number; placement: number; licensure: number } };
    }) =>
      apiRequest<{ ruleSet: RuleSet }>(`/api/accreditation/frameworks/${frameworkId}/rule-sets`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["accreditation", "frameworks", variables.frameworkId, "rule-sets"],
      }),
  });
}

export function useReportingPeriods() {
  return useQuery({
    queryKey: ["accreditation", "reporting-periods"],
    queryFn: () =>
      apiRequest<{ reportingPeriods: ReportingPeriod[] }>(
        "/api/accreditation/reporting-periods",
      ).then((r) => r.reportingPeriods),
  });
}

export function useReportingPeriod(id: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "reporting-periods", id],
    queryFn: () =>
      apiRequest<{ reportingPeriod: ReportingPeriod }>(
        `/api/accreditation/reporting-periods/${id}`,
      ).then((r) => r.reportingPeriod),
    enabled: id !== undefined,
  });
}

export function useCreateReportingPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ruleSetId: number;
      label: string;
      startDate: string;
      endDate: string;
      outcomesDeadline?: string;
    }) =>
      apiRequest<{ reportingPeriod: ReportingPeriod }>("/api/accreditation/reporting-periods", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accreditation", "reporting-periods"] }),
  });
}

export function useSetOutcomesDeadline(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (outcomesDeadline: string | null) =>
      apiRequest<{ reportingPeriod: ReportingPeriod }>(`/api/accreditation/reporting-periods/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ outcomesDeadline }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accreditation", "reporting-periods", id] });
      queryClient.invalidateQueries({ queryKey: ["accreditation", "readiness", id] });
    },
  });
}

function useReportingPeriodAction(
  id: number,
  action: "finalize" | "submit" | "reopen" | "compute" | "validate",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason: string }) =>
      apiRequest(`/api/accreditation/reporting-periods/${id}/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accreditation", "reporting-periods"] });
      queryClient.invalidateQueries({ queryKey: ["accreditation", "results", id] });
      queryClient.invalidateQueries({ queryKey: ["accreditation", "validation-issues", id] });
    },
  });
}

export const useFinalizeReportingPeriod = (id: number) => useReportingPeriodAction(id, "finalize");
export const useSubmitReportingPeriod = (id: number) => useReportingPeriodAction(id, "submit");
export const useReopenReportingPeriod = (id: number) => useReportingPeriodAction(id, "reopen");
export const useComputeReportingPeriod = (id: number) => useReportingPeriodAction(id, "compute");
export const useValidateReportingPeriod = (id: number) => useReportingPeriodAction(id, "validate");

export function useCplResults(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "results", reportingPeriodId],
    queryFn: () =>
      apiRequest<{ results: CplResult[] }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/results`,
      ).then((r) => r.results),
    enabled: reportingPeriodId !== undefined,
  });
}

export function useDrillDown(
  reportingPeriodId: number | undefined,
  params:
    | { metric: CplMetric; programId?: number; bucket: "numerator" | "denominator" | "excluded" }
    | undefined,
) {
  const query = new URLSearchParams();
  if (params) {
    query.set("metric", params.metric);
    query.set("bucket", params.bucket);
    if (params.programId) query.set("programId", String(params.programId));
  }

  return useQuery({
    queryKey: ["accreditation", "drill-down", reportingPeriodId, params],
    queryFn: () =>
      apiRequest<{ students: DrillDownStudent[] }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/drill-down?${query.toString()}`,
      ).then((r) => r.students),
    enabled: reportingPeriodId !== undefined && params !== undefined,
  });
}

export function useStudentExplanation(
  reportingPeriodId: number | undefined,
  enrollmentId: number | undefined,
) {
  return useQuery({
    queryKey: ["accreditation", "explanation", reportingPeriodId, enrollmentId],
    queryFn: () =>
      apiRequest<{ classifications: StudentExplanation[] }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/enrollments/${enrollmentId}/explanation`,
      ).then((r) => r.classifications),
    enabled: reportingPeriodId !== undefined && enrollmentId !== undefined,
  });
}

export function useValidationIssues(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "validation-issues", reportingPeriodId],
    queryFn: () =>
      apiRequest<{ issues: ValidationIssue[] }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues`,
      ).then((r) => r.issues),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface ReadinessMetric {
  numerator: number;
  denominator: number;
  percentage: number;
  benchmark: number;
  negotiated: boolean;
  meetsBenchmark: boolean;
}

export interface ReadinessRow {
  program: { id: number; name: string };
  metrics: Partial<Record<CplMetric, ReadinessMetric>>;
  openIssueCount: number;
  ready: boolean;
}

export interface ReadinessSummary {
  totalPrograms: number;
  readyPrograms: number;
  programsWithOpenIssues: number;
  outcomesDeadline: string | null;
  daysUntilOutcomesDeadline: number | null;
}

export function useReadiness(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "readiness", reportingPeriodId],
    queryFn: () =>
      apiRequest<{ readiness: ReadinessRow[]; summary: ReadinessSummary }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/readiness`,
      ),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface TrendPoint {
  reportingPeriod: {
    id: number;
    label: string;
    startDate: string;
    endDate: string;
    status: ReportingPeriodStatus;
  };
  metrics: Partial<Record<CplMetric, { numerator: number; denominator: number; percentage: number }>>;
}

export function useTrends(programId: number | undefined) {
  const query = new URLSearchParams();
  if (programId) query.set("programId", String(programId));

  return useQuery({
    queryKey: ["accreditation", "trends", programId],
    queryFn: () =>
      apiRequest<{ trends: TrendPoint[] }>(`/api/accreditation/trends?${query.toString()}`).then(
        (r) => r.trends,
      ),
  });
}

export function useResolveValidationIssue(reportingPeriodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: number) =>
      apiRequest(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/${issueId}/resolve`,
        {
          method: "PATCH",
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["accreditation", "validation-issues", reportingPeriodId],
      }),
  });
}

export function useBulkResolveValidationIssues(reportingPeriodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueIds: number[]) =>
      apiRequest<{ resolvedCount: number }>(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/bulk-resolve`,
        { method: "PATCH", body: JSON.stringify({ issueIds }) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["accreditation", "validation-issues", reportingPeriodId],
      }),
  });
}

export interface ImprovementPlanUpdate {
  id: number;
  improvementPlanId: number;
  updateText: string;
  correctiveAction: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ImprovementPlan {
  id: number;
  programId: number;
  metric: CplMetric;
  reportingPeriodId: number;
  currentResult: string | null;
  target: string | null;
  problemDescription: string | null;
  rootCause: string | null;
  responsibleUserId: number;
  dueDate: string | null;
  status: ImprovementPlanStatus;
  program: { id: number; name: string };
  reportingPeriod: { id: number; label: string };
  responsibleUser: { id: number; name: string };
  updates?: ImprovementPlanUpdate[];
  _count?: { updates: number };
}

export interface CreateImprovementPlanInput {
  programId: number;
  metric: CplMetric;
  reportingPeriodId: number;
  currentResult?: number;
  target?: number;
  problemDescription?: string;
  rootCause?: string;
  responsibleUserId: number;
  dueDate?: string;
}

export function useImprovementPlans(filters: {
  reportingPeriodId?: number;
  programId?: number;
  status?: ImprovementPlanStatus;
}) {
  const query = new URLSearchParams();
  if (filters.reportingPeriodId) query.set("reportingPeriodId", String(filters.reportingPeriodId));
  if (filters.programId) query.set("programId", String(filters.programId));
  if (filters.status) query.set("status", filters.status);

  return useQuery({
    queryKey: ["accreditation", "improvement-plans", filters],
    queryFn: () =>
      apiRequest<{ improvementPlans: ImprovementPlan[] }>(
        `/api/accreditation/improvement-plans?${query.toString()}`,
      ).then((r) => r.improvementPlans),
  });
}

export function useImprovementPlan(id: number | undefined) {
  return useQuery({
    queryKey: ["accreditation", "improvement-plans", id],
    queryFn: () =>
      apiRequest<{ improvementPlan: ImprovementPlan }>(
        `/api/accreditation/improvement-plans/${id}`,
      ).then((r) => r.improvementPlan),
    enabled: id !== undefined,
  });
}

export function useCreateImprovementPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateImprovementPlanInput) =>
      apiRequest<{ improvementPlan: ImprovementPlan }>("/api/accreditation/improvement-plans", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accreditation", "improvement-plans"] }),
  });
}

export function useUpdateImprovementPlan(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateImprovementPlanInput> & { status?: ImprovementPlanStatus }) =>
      apiRequest<{ improvementPlan: ImprovementPlan }>(
        `/api/accreditation/improvement-plans/${id}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accreditation", "improvement-plans"] }),
  });
}

export function useAddImprovementPlanUpdate(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { updateText: string; correctiveAction?: string }) =>
      apiRequest<{ update: ImprovementPlanUpdate }>(
        `/api/accreditation/improvement-plans/${id}/updates`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accreditation", "improvement-plans", id] }),
  });
}
