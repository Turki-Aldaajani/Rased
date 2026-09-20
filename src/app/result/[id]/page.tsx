import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import RetryEvaluation from "@/components/RetryEvaluation";
import {
  AUDIENCE_LABELS,
  CategoryPill,
  DIFFICULTY_LABELS,
  DuplicateBadge,
  EditorialMeter,
  PointsBadge,
  STATUS_META,
  StatusBadge,
  VerificationBadge,
  categoryLabel,
} from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EDITORIAL_LABELS, EDITORIAL, POINTS } from "@/lib/config/rules";
import {
  effectiveCategory,
  effectiveDuplicate,
  effectivePoints,
  effectiveStatus,
  type EditorialDimension,
} from "@/lib/db/schema";
import { getContribution } from "@/lib/db/store";
import { cycleLabel, formatDate } from "@/lib/util/date";
import { hostname } from "@/lib/util/text";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const POINT_REASON_TEXT: Record<string, string> = {
  valid_contribution: "مساهمة صحيحة وجديدة.",
  new_angle_on_known_topic: "موضوع معروف، لكن مساهمتك تضيف قيمة جديدة.",
  cycle_cap_reached: `بلغت الحد الأقصى ${POINTS.maxPerCycle} نقاط في هذه الدورة، المساهمة محفوظة وقد تدخل النشرة.`,
  duplicate: "سبق إرسال المحتوى نفسه، لذا لا تُحتسب نقطة جديدة.",
  rejected: "لم تستوفِ المساهمة الحد الأدنى للقبول.",
  pending_evaluation: "لم يكتمل التقييم بعد.",
  blocked_source: "لم تُحتسب نقطة بعد، تنتظر قرار المضيف.",
  admin_override: "عدّل المضيف النقاط يدويًا.",
};

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  const c = await getContribution(id);
  if (!c) notFound();

  const e = c.evaluation;
  const status = effectiveStatus(c);
  const points = effectivePoints(c);
  const category = effectiveCategory(c);
  const duplicate = effectiveDuplicate(c);
  const original = e?.duplicate.ofId
    ? await getContribution(e.duplicate.ofId)
    : null;

  // A host's decision replaces "waiting for review". The stored reason still
  // says so, because an override never rewrites the automatic result.
  const reasonText =
    c.points.reason === "blocked_source" && status !== "blocked_source"
      ? "راجعها المضيف يدويًا."
      : POINT_REASON_TEXT[c.points.reason];
  const summaryLine = e?.summaryForMember || reasonText || "لا يوجد ملخّص.";

  const dimensions = e
    ? (Object.keys(EDITORIAL.weights) as EditorialDimension[]).map((key) => ({
        key,
        label: EDITORIAL_LABELS[key],
        value: e.editorial.breakdown[key] ?? 0,
        max: EDITORIAL.weights[key],
      }))
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/dashboard">
            <ArrowRight />
            الرئيسية
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/">أضف مساهمة أخرى</Link>
        </Button>
      </div>

      {/* What the member came here to read: status, category, points, why. */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-5">
          <PointsBadge points={points} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <CategoryPill category={category} />
              <StatusBadge status={status} />
              <DuplicateBadge outcome={duplicate} />
            </div>
            <h1 className="text-lg font-semibold leading-snug text-foreground">
              {c.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              أرسلها{" "}
              <Link
                href={`/profile/${c.memberId}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {c.memberName}
              </Link>{" "}
              · {formatDate(c.createdAt)} · دورة {cycleLabel(c.cycleKey)}
            </p>
          </div>
        </div>

        <div className="border-t border-border bg-muted px-5 py-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">الحالة</dt>
              <dd className="mt-1 text-sm text-foreground">
                {STATUS_META[status].text}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">التصنيف</dt>
              <dd className="mt-1 text-sm text-foreground">
                {categoryLabel(category)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">النقاط</dt>
              <dd className="mt-1 text-sm text-foreground">
                {points > 0 ? `+${points}` : "بلا نقاط"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-foreground">
            {summaryLine}
          </p>
          {c.points.reason !== "valid_contribution" &&
            reasonText &&
            reasonText !== summaryLine && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {reasonText}
              </p>
            )}
        </div>
      </Card>

      {status === "pending" && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            التقييم لم يكتمل
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {c.evaluationError
              ? `تعذّر الوصول إلى المقيّم: ${c.evaluationError}`
              : "تعذّر الوصول إلى المقيّم."}{" "}
            مساهمتك محفوظة ولم تُفقد. أعد المحاولة وستُحتسب النقطة إن كانت
            مستحقة.
          </p>
          <RetryEvaluation id={c.id} attempts={c.evaluationAttempts} />
        </Card>
      )}

      {status === "blocked_source" && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            لا يمكن تقييم هذا الرابط آليًا
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            يمنع هذا المصدر الوصول الآلي إلى صفحاته، وهذا لا يعني أن رابطك
            خاطئ. مساهمتك محفوظة وسيراجعها المضيف يدويًا، وستُحتسب النقطة إن
            كانت مستحقة.
          </p>
        </Card>
      )}

      {status === "rejected" && e?.rejectionReason && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">سبب الرفض</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {e.rejectionReason}
          </p>
          <ul className="mt-4 grid gap-1.5 border-t border-border pt-3 text-xs sm:grid-cols-2">
            {[
              ["aiRelated", "مرتبطة بالذكاء الاصطناعي"],
              ["specificInformation", "تحمل معلومة محددة"],
              ["usableSource", "الرابط صالح"],
              ["understandableFromSource", "يمكن فهمها من المصدر"],
              ["memberExplainedWhy", "العضو وضّح سبب الأهمية"],
              ["usefulKnowledge", "تقدّم فائدة عملية"],
            ].map(([key, label]) => {
              const ok = e.eligibility[key as keyof typeof e.eligibility];
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: ok ? "var(--success)" : "var(--destructive)",
                    }}
                    aria-hidden
                  />
                  {label}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {c.adminOverride && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-foreground">عدّله المضيف</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.adminOverride.points != null &&
              `النقاط: ${c.points.awarded} ← ${c.adminOverride.points}. `}
            {c.adminOverride.status &&
              `الحالة: ${STATUS_META[c.adminOverride.status].text}. `}
            {c.adminOverride.primaryCategory &&
              `التصنيف: ${categoryLabel(c.adminOverride.primaryCategory)}. `}
            {c.adminOverride.note ? `«${c.adminOverride.note}»` : ""}
          </p>
        </Card>
      )}

      {/* What the member wrote, and how the evaluator read it. */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          الخبر بكلمات {c.memberName}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          هذا النص يظهر في النشرة كما هو.
        </p>
        <p className="font-serif-text mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {c.memberReason || "لم يكتب العضو نصًا."}
        </p>
        {c.note && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
            {c.note}
          </p>
        )}
        {e?.aiInterpretation && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">قراءة رصد لكلامك</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {e.aiInterpretation}
            </p>
          </div>
        )}
      </Card>

      {e && (
        <>
          {/* Classification */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground">التصنيف</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CategoryPill category={e.classification.primary} />
              {e.classification.secondary.map((s) => (
                <span key={s} className="text-xs text-muted-foreground">
                  {categoryLabel(s)}
                </span>
              ))}
            </div>
            {e.classification.reason && (
              <p className="mt-3 text-sm text-muted-foreground">
                {e.classification.reason}
              </p>
            )}

            <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  الجمهور المستفيد
                </dt>
                <dd className="mt-1.5 text-sm text-foreground">
                  {e.audience.tags
                    .map((a) => AUDIENCE_LABELS[a] ?? a)
                    .join("، ") || "لا يوجد"}
                </dd>
                {e.audience.reason && (
                  <dd className="mt-1 text-xs text-muted-foreground">
                    {e.audience.reason}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">مستوى الصعوبة</dt>
                <dd className="mt-1.5 text-sm text-foreground">
                  {DIFFICULTY_LABELS[e.difficulty.level]}
                </dd>
                {e.difficulty.prerequisites.length > 0 && (
                  <dd className="mt-1 text-xs text-muted-foreground">
                    متطلبات: {e.difficulty.prerequisites.join("، ")}
                  </dd>
                )}
              </div>
            </dl>
            {c.focusArea && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                مجال بحثك وقت الإرسال: {categoryLabel(c.focusArea)}، اتجاه فقط،
                والتصنيف أعلاه مبني على المحتوى نفسه.
              </p>
            )}
          </Card>

          {/* Extracted content */}
          {(e.extracted.keyPoints.length > 0 ||
            e.extracted.entity ||
            e.extracted.practicalValue) && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-foreground">
                ما استُخرج من المصدر
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">الجهة</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {e.extracted.entity ?? "غير مذكورة"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">المصدر</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {e.extracted.source ?? hostname(c.url)}
                  </dd>
                </div>
              </dl>
              {e.extracted.keyPoints.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {e.extracted.keyPoints.map((p, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm text-muted-foreground before:content-['·']"
                    >
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.extracted.capabilities.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">أبرز القدرات</p>
                  <ul className="mt-2 space-y-1.5">
                    {e.extracted.capabilities.map((p, i) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {e.extracted.practicalValue && (
                <p className="mt-4 border-t border-border pt-4 text-sm text-foreground">
                  {e.extracted.practicalValue}
                </p>
              )}
            </Card>
          )}

          {/* Verification */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">التحقق</h2>
              <VerificationBadge status={e.verification.status} />
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  تاريخ النشر الأصلي
                </dt>
                <dd className="mt-1.5 text-sm text-foreground">
                  {formatDate(e.verification.originalDate)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">المصدر المُرسَل</dt>
                <dd className="mt-1.5 truncate text-sm">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
                  >
                    {hostname(c.url) || c.url}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">
                  المصدر الأصلي / الرسمي
                </dt>
                <dd className="mt-1.5 truncate text-sm">
                  {e.verification.resolvedSource ? (
                    <a
                      href={e.verification.resolvedSource}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
                    >
                      {hostname(e.verification.resolvedSource) ||
                        e.verification.resolvedSource}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">غير محدَّد</span>
                  )}
                </dd>
              </div>
            </dl>

            {e.verification.evidence.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-border pt-4">
                {e.verification.evidence.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-muted-foreground before:content-['·']"
                  >
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              مسؤولية التأكد من صحة المصدر وتاريخه تقع أولًا على العضو. رصد لا
              يدّعي تحققًا لم يجرِه.
            </p>
          </Card>

          {/* Duplicate check */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                فحص التكرار
              </h2>
              <DuplicateBadge outcome={duplicate} always />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {e.duplicate.reason || "لا توجد معلومات مسجَّلة عن التكرار."}
            </p>
            {e.duplicate.confidence > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                درجة الثقة في المطابقة: {Math.round(e.duplicate.confidence * 100)}٪
              </p>
            )}
            {original && (
              <Link
                href={`/result/${original.id}`}
                className="mt-4 flex items-center gap-3 rounded-md border border-border p-3 transition-colors duration-200 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">
                    أرسلها أولًا {original.memberName} في{" "}
                    {formatDate(original.createdAt)}
                  </span>
                  <span className="block truncate text-sm text-foreground">
                    {original.title}
                  </span>
                </span>
              </Link>
            )}
          </Card>

          {/* Editorial value, clearly separated from points */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  القيمة التحريرية
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  تُستخدم لترتيب محتوى النشرة فقط، لا علاقة لها بنقاطك.
                </p>
              </div>
              <EditorialMeter score={e.editorial.score} />
            </div>

            <ul className="mt-5 space-y-3.5 border-t border-border pt-4">
              {dimensions.map((d) => (
                <li key={d.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-foreground">{d.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      <span className="text-sm text-foreground">{d.value}</span>/
                      {d.max}
                    </span>
                  </div>
                  <div className="meter mt-1.5">
                    <span style={{ width: `${(d.value / d.max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            {e.editorial.notes.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                {e.editorial.notes.map((n, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* Nothing evaluated a blocked source, so there is no engine to credit. */}
      {c.status !== "blocked_source" && (
        <p className="pb-2 text-center text-xs text-muted-foreground">
          {e?.engine === "ai"
            ? `قُيِّمت بواسطة ${e.model} مع تحقق مباشر من الإنترنت.`
            : "قُيِّمت بالخوارزمية غير المتصلة، فعّل ANTHROPIC_API_KEY للتقييم الكامل."}
        </p>
      )}
    </div>
  );
}
