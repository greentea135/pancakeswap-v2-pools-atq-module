import fetch from "node-fetch";
import { ContractTag, ITagService } from "atq-types";

const SUBGRAPH_URLS: Record<string, { decentralized: string }> = {
  // Ethereum Mainnet subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "1": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/9opY17WnEPD4REcC43yHycQthSeUMQE26wyoeMjZTLEx",
  },
  // ZKsync subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "324": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/6dU6WwEz22YacyzbTbSa3CECCmaD8G7oQ8aw6MYd5VKU",
  },
  // Polygon zkEVM subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "1101": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/37WmH5kBu6QQytRpMwLJMGPRbXvHgpuZsWqswW4Finc2",
  },
  // Base subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "8453": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/2NjL7L4CmQaGJSacM43ofmH6ARf6gJoBeBaJtz9eWAQ9",
  },
  // Arbitrum subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "42161": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/EsL7geTRcA3LaLLM9EcMFzYbUgnvf8RixoEEGErrodB3",
  },
  // Linea subgraph, by team deployer 0xd09971d8ed6c6a5e57581e90d593ee5b94e348d4
  "59144": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/Eti2Z5zVEdARnuUzjCbv4qcimTLysAizsqH3s6cBfPjB",
  },
};

interface PoolToken {
  id: string;
  name: string;
  symbol: string;
}

interface Pair {
  id: string;
  timestamp: number;
  token0: PoolToken;
  token1: PoolToken;
}

interface GraphQLData {
  pairs: Pair[];
}

interface GraphQLResponse {
  data?: GraphQLData;
  errors?: { message: string }[];
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const GET_PAIRS_QUERY = `
query GetPairs($lastTimestamp: Int) {
  pairs(
    first: 1000,
    orderBy: timestamp,
    orderDirection: asc,
    where: { timestamp_gt: $lastTimestamp }
  ) {
    id
    timestamp
    token0 {
      id
      name
      symbol
    }
    token1 {
      id
      name
      symbol
    }
  }
}
`;

function isError(e: unknown): e is Error {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as Error).message === "string"
  );
}

function containsInvalidValue(text: string): boolean {
  const containsHtml = /<[^>]*>/.test(text);
  const isEmpty = text.trim() === "";
  return isEmpty || containsHtml;
}

function truncateString(text: string, maxLength: number) {
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text;
}

async function fetchData(
  subgraphUrl: string,
  lastTimestamp: number
): Promise<Pair[]> {
  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: GET_PAIRS_QUERY,
      variables: { lastTimestamp },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as GraphQLResponse;
  if (result.errors) {
    result.errors.forEach((error) => {
      console.error(`GraphQL error: ${error.message}`);
    });
    throw new Error("GraphQL errors occurred: see logs for details.");
  }

  if (!result.data || !result.data.pairs) {
    throw new Error("No pairs data found.");
  }

  return result.data.pairs;
}

function prepareUrl(chainId: string, apiKey: string): string {
  const urls = SUBGRAPH_URLS[chainId];
  if (!urls || isNaN(Number(chainId))) {
    const supportedChainIds = Object.keys(SUBGRAPH_URLS).join(", ");
    throw new Error(
      `Unsupported or invalid Chain ID provided: ${chainId}. Only the following values are accepted: ${supportedChainIds}`
    );
  }
  return urls.decentralized.replace("[api-key]", encodeURIComponent(apiKey));
}

function transformPairsToTags(chainId: string, pairs: Pair[]): ContractTag[] {
  const validPairs: Pair[] = [];
  const rejectedNames: string[] = [];

  pairs.forEach((pair) => {
    const token0Invalid =
      containsInvalidValue(pair.token0.name) ||
      containsInvalidValue(pair.token0.symbol);
    const token1Invalid =
      containsInvalidValue(pair.token1.name) ||
      containsInvalidValue(pair.token1.symbol);

    if (token0Invalid || token1Invalid) {
      if (token0Invalid) {
        rejectedNames.push(
          `Contract: ${pair.id} rejected due to invalid token symbol/name - Token0: ${pair.token0.name}, Symbol: ${pair.token0.symbol}`
        );
      }
      if (token1Invalid) {
        rejectedNames.push(
          `Contract: ${pair.id} rejected due to invalid token symbol/name - Token1: ${pair.token1.name}, Symbol: ${pair.token1.symbol}`
        );
      }
    } else {
      validPairs.push(pair);
    }
  });

  if (rejectedNames.length > 0) {
    console.log("Rejected contracts:", rejectedNames);
  }

  return validPairs.map((pair) => {
    const maxSymbolsLength = 45;
    const symbolsText = `${pair.token0.symbol}/${pair.token1.symbol}`;
    const truncatedSymbolsText = truncateString(symbolsText, maxSymbolsLength);

    return {
      "Contract Address": `eip155:${chainId}:${pair.id}`,
      "Public Name Tag": `${truncatedSymbolsText} Pool`,
      "Project Name": "PancakeSwap v2",
      "UI/Website Link": "https://pancakeswap.finance/",
      "Public Note": `The liquidity pool contract on PancakeSwap v2 for the ${pair.token0.name} (${pair.token0.symbol}) / ${pair.token1.name} (${pair.token1.symbol}) pair.`,
    };
  });
}

class TagService implements ITagService {
  returnTags = async (
    chainId: string,
    apiKey: string
  ): Promise<ContractTag[]> => {
    let lastTimestamp: number = 0;
    let allTags: ContractTag[] = [];
    let isMore = true;

    const url = prepareUrl(chainId, apiKey);

    while (isMore) {
      try {
        const pairs = await fetchData(url, lastTimestamp);
        allTags.push(...transformPairsToTags(chainId, pairs));

        isMore = pairs.length === 1000;
        if (isMore) {
          lastTimestamp = parseInt(pairs[pairs.length - 1].timestamp.toString(), 10);
        }
      } catch (error) {
        if (isError(error)) {
          console.error(`An error occurred: ${error.message}`);
          throw new Error(`Failed fetching data: ${error}`);
        } else {
          console.error("An unknown error occurred.");
          throw new Error("An unknown error occurred during fetch operation.");
        }
      }
    }
    return allTags;
  };
}

const tagService = new TagService();
export const returnTags = tagService.returnTags;

