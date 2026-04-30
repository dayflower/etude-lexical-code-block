const theme = {
  paragraph: "mb-2",
};

function onError(error: Error) {
  console.error(error);
}

export const initialConfig = {
  namespace: "LexicalCodeBlockTest",
  theme,
  onError,
  nodes: [],
};
