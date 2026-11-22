import { useEffect, useRef, useState } from 'react';
import { DEMO_DECISIONS } from './demo';
import { ReviewCase } from './demo/ReviewCase';
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
};
function readRoute(): Route {
  const [slug, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const rawStage = params.get('stage');
  const stage =
    stages.find((item) => item.id === rawStage)?.id ??
    (slug === 'verify' ? 'signature' : 'request');
  return {
    page: ['technical', 'decisions', 'playground', 'verify', 'about'].includes(slug)
      ? 'technical'
      : 'case',
    packet: params.get('packet') === 'received' ? 'received' : 'original',
    fixture: params.get('fixture') === 'FG-1048' ? 'FG-1048' : 'FG-1047',
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
            Technical evidence
          </a>
        </nav>
      </header>
      <main ref={main} id="content" tabIndex={-1} className="study-main">
        <div hidden={route.page !== 'case'}>
          <header className="study-intro">
            <div className="study-kicker">Platform security · Investment decision</div>
            <h1>Should every tool decision carry a signed receipt?</h1>
            <p>
              A coding agent asked to edit the file that governs its permissions. The gateway denied
              the request. Decide whether the security team should fund a receipt pilot or keep
              using decision logs for change reviews.
            </p>
          </header>
          <ReviewCase
            record={archive}
            packet={route.packet}
            onPacket={(packet) => replace({ packet })}
            technicalHref={technicalHref}
          />
        </div>
        {route.page === 'technical' && (
          <CaseEvidence
            key={route.packet + route.fixture}
            record={archive}
            packet={route.packet}
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
