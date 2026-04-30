import Editor from "./Editor";

function App() {
  return (
    <main className="max-w-3xl mx-auto mt-12 p-4">
      <h1 className="text-2xl font-bold mb-6">Lexical Code Block</h1>
      <div className="relative">
        <Editor />
      </div>
    </main>
  );
}

export default App;
