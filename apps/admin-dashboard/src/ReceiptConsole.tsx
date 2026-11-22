import { useEffect, useRef, useState } from 'react';
import { DEMO_DECISIONS } from './demo';
import { PilotWorksheet } from './demo/ReviewCase';
import { EvidenceDesk, type CaseDocument } from './demo/EvidenceDesk';
import type { Packet } from './demo/caseRecords';
import { CaseEvidence, stages, type Stage } from './demo/CaseEvidence';
import './ReceiptConsole.css';

const archive = DEMO_DECISIONS.find((item) => item.id === 'FG-1048')!;
type Route = {
  page: 'case' | 'technical';
  packet: Packet;
  fixture: 'FG-1048' | 'FG-1047';
  stage: Stage;
  section: string;
  document: CaseDocument;
};
function readRoute(): Route {
  const [slug, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const rawStage = params.get('stage');
  const stage =
    stages.find((item) => item.id === rawStage)?.id ??
    (slug === 'verify' ? 'signature' : 'request');
  const packet =
    params.get('packet') === 'original'
      ? 'original'
      : params.get('packet') === 'received' || !slug || slug === 'case'
        ? 'received'
        : 'original';
  const doc = params.get('doc');
  return {
    document: doc === 'history' || doc === 'neighbor' ? doc : packet,
    page: ['technical', 'decisions', 'playground', 'verify', 'about'].includes(slug)
      ? 'technical'
      : 'case',
    packet,
    fixture: params.get('fixture') === 'FG-1047' ? 'FG-1047' : 'FG-1048',
    stage,
    section:
      slug === 'pilot' || params.get('section') === 'economics'
        ? 'economics'
        : params.get('section') === 'investigation'
          ? 'investigation'
          : '',
  };
}
function href(route: Route) {
  const params = new URLSearchParams({
    packet: route.packet,
    fixture: route.fixture,
    stage: route.stage,
  });
  if (route.document === 'history' || route.document === 'neighbor')
    params.set('doc', route.document);
  if (route.page === 'case' && route.section) params.set('section', route.section);
  return '#/' + route.page + '?' + params.toString();
}
export default function ReceiptConsole() {
  const [route, setRoute] = useState(readRoute);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const target =
      route.page === 'case' && route.section
        ? document.getElementById('case-' + route.section)
        : main.current;
    target?.focus({ preventScroll: true });
    if (route.page === 'case' && route.section) target?.scrollIntoView?.({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [route.page, route.section]);
  function replace(patch: Partial<Route>) {
    const next = { ...route, ...patch };
    window.history.replaceState(null, '', href(next));
    setRoute(next);
  }
  const caseHref = href({ ...route, page: 'case', section: 'investigation' });
  const pilotHref = href({ ...route, page: 'case', section: 'economics' });
  function chooseDocument(document: CaseDocument) {
    const packet = document === 'original' || document === 'received' ? document : route.packet;
    replace({
      document,
      packet,
      fixture: document === 'neighbor' ? 'FG-1047' : 'FG-1048',
      stage: document === 'history' ? 'effect' : 'signature',
    });
  }
  const technicalHref = href({ ...route, page: 'technical' });
  return (
    <>
      <a
        href="#content"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="study-header">
        <a className="study-brand" href={href({ ...route, page: 'case', section: '' })}>
          FidusGate
        </a>
        <nav aria-label="Case navigation">
          <a
            href={href({ ...route, page: 'case', section: '' })}
            aria-current={route.page === 'case' ? 'page' : undefined}
          >
            Business case
          </a>
          <a href={technicalHref} aria-current={route.page === 'technical' ? 'page' : undefined}>
            Technical guide
          </a>
        </nav>
      </header>
      <main ref={main} id="content" tabIndex={-1} className="study-main">
        <div hidden={route.page !== 'case'}>
          <div hidden={Boolean(route.section)}>
            <header className="study-intro">
              <p className="study-kicker">Harbor Dispatch · A fictional software release</p>
              <h1>Can the customer fix ship today?</h1>
              <p>
                Harbor Dispatch builds scheduling software for field-service crews. A bug is putting
                some appointments on the dispatch board twice. Until the fix ships, dispatchers have
                to call crews to confirm which visits to make.
              </p>
            </header>
            <section className="study-body" aria-labelledby="handover">
              <h2 id="handover">Why the release is on hold</h2>
              <p className="case-context">
                Engineers often ask a coding assistant to prepare release notes. Reading project
                files is routine. Editing the file that sets the assistant’s permissions is a
                different matter: it could change what tools the assistant can use on the next job.
              </p>
              <div className="release-memo">
                <p className="study-kicker">From Maya, release lead · 14:32 UTC</p>
                <p>
                  “The assistant requested an edit to our permissions file while we were preparing
                  the fix. Engineering forwarded the decision in a ticket. Can we rely on that copy?
                  And did the file itself change?”
                </p>
              </div>
              <p className="case-context">
                Maya has the ticket. Platform security keeps the original decision. The repository
                owner keeps the file history. While those teams piece the story together,
                dispatchers keep checking appointments by hand.
              </p>
              <h2 className="framework-heading">What FidusGate adds to a change review</h2>
              <ol className="request-flow">
                <li>
                  <span>At the request</span>
                  <strong>Check permission</strong>
                  <p>
                    The assistant asks to use a tool. FidusGate’s gateway checks the request against
                    the team’s written rules.
                  </p>
                </li>
                <li>
                  <span>At the decision</span>
                  <strong>Sign a receipt</strong>
                  <p>
                    The gateway can sign a record of the tool, the decision and its reason. The team
                    can attach a copy to the ticket.
                  </p>
                </li>
                <li>
                  <span>At the handoff</span>
                  <strong>Check the copy</strong>
                  <p>
                    Maya can verify the copy against the signing key. The repository owner can then
                    answer the separate question about the file.
                  </p>
                </li>
              </ol>
              <div className="opening-ticket">
                <div>
                  <h2>Review Maya’s ticket</h2>
                  <p>
                    Try using the forwarded copy, or compare it with the archive. See what each
                    choice lets Maya report.
                  </p>
                </div>
                <a
                  className="primary-button"
                  href={href({
                    ...route,
                    page: 'case',
                    section: 'investigation',
                    document: 'received',
                    packet: 'received',
                    fixture: 'FG-1048',
                    stage: 'signature',
                  })}
                >
                  Open the change ticket
                </a>
              </div>
              <p className="study-scope">
                Fictional release review · Synthetic records · Browser-only investigation
              </p>
            </section>
          </div>
          <div hidden={route.section !== 'investigation'}>
            <EvidenceDesk
              active={route.document}
              onSelect={chooseDocument}
              technicalHref={href({
                ...route,
                page: 'technical',
                stage: route.document === 'history' ? 'effect' : 'signature',
                fixture: route.document === 'neighbor' ? 'FG-1047' : 'FG-1048',
              })}
              pilotHref={pilotHref}
            />
          </div>
          <div hidden={route.section !== 'economics'}>
            <PilotWorksheet caseHref={caseHref} />
          </div>
        </div>
        {route.page === 'technical' && (
          <CaseEvidence
            key={route.packet + route.fixture}
            record={archive}
            packet={route.packet}
            document={route.document}
            fixtureId={route.fixture}
            stage={route.stage}
            onFixture={(fixture) => replace({ fixture })}
            stageHref={(stage) => href({ ...route, stage })}
            caseHref={caseHref}
          />
        )}
      </main>
    </>
  );
}
