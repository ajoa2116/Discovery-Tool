namespace ApplicationCompanion;

internal static class FixtureDocument
{
    // Fixed adversarial fixture variants; no externally supplied URL or code.
    internal static string Html(string mode)
    {
        string action = mode switch
        {
            "bad-nonce" => "r.nonce = 'wrong'; send(r);",
            "bad-generation" => "r.generation++; send(r);",
            "bad-navigation-id" => "r.navigationId = 'wrong'; send(r);",
            "extra-field" => "r.extra = true; send(r);",
            "malformed-message" => "send('malformed');",
            "oversized-message" => "r.extra = 'x'.repeat(2048); send(r);",
            "replay" => "send(r); send(r);",
            "challenge-timeout" or "late-response" => "setTimeout(() => send(r), 3500);",
            "unapproved-navigation" => "location.href = 'https://rejected.invalid/';",
            "popup" => "window.open('https://rejected.invalid/');",
            "frame" => "const f = document.createElement('iframe'); f.src = 'about:blank'; document.body.append(f);",
            "post-ready-navigation" => "send(r); setTimeout(() => location.href = 'https://rejected.invalid/', 700);",
            "reload" => "send(r); setTimeout(() => location.reload(), 700);",
            "fragment" => "send(r); setTimeout(() => location.hash = 'unapproved', 700);",
            _ => "send(r);"
        };
        string early = mode == "early-message" ? "send({v:1,type:'READY',generation:1,navigationId:'1',nonce:'early'});" : "";
        return """
            <!doctype html><html><head><meta charset="utf-8"><title>Trusted companion fixture</title></head>
            <body><h1 id="fixture-proof">CCTV trusted companion fixture</h1><p>No bootstrap authority or camera connection.</p>
            <script>
            const send = value => window.chrome.webview.postMessage(value);
            window.chrome.webview.addEventListener('message', event => {
              const c = event.data;
              if (window !== window.top || location.href !== 'https://companion-fixture.invalid/ready.html' ||
                  c.v !== 1 || c.type !== 'CHALLENGE' || typeof c.nonce !== 'string' ||
                  typeof c.generation !== 'number' || typeof c.navigationId !== 'string') return;
              const r = {v:1,type:'READY',generation:c.generation,navigationId:c.navigationId,nonce:c.nonce};
            """ + action + "\n});\n" + early + "\n</script></body></html>";
    }
}
