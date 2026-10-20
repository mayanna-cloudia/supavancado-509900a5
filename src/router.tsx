import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Parâmetros da URL em texto simples (?idclinic=372, não ?idclinic=%22372%22), para os links
// copiados da barra ficarem legíveis. Cada rota converte o que precisa no seu validateSearch.
const parseSearch = parseSearchWith((value) => value);
const stringifySearch = stringifySearchWith((value) =>
  typeof value === "string" ? value : JSON.stringify(value),
);

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    parseSearch,
    stringifySearch,
  });

  return router;
};
