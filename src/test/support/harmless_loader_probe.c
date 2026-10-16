/* Fixture only: no entry point. Its sole import must be explicitly reviewed. */
__declspec(dllimport) int __cdecl fixture_dependency(void);
__declspec(dllexport) int __cdecl fixture_probe(void) { return fixture_dependency(); }
