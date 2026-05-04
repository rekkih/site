// AI-powered content safety check for chat messages using OpenRouter

import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

// Result type for content safety check
export type SafetyCheckResult = {
    safe: boolean;
    reason?: string;
    categories?: {
        sexual: boolean;
        harmful: boolean;
        abusive: boolean;
        hate: boolean;
        harassment: boolean;
    };
};

// Schema for structured output from the safety model
const SafetySchema = z.object({
    safe: z.boolean(),
    reason: z.string().optional(),
    categories: z.object({
        sexual: z.boolean(),
        harmful: z.boolean(),
        abusive: z.boolean(),
        hate: z.boolean(),
        harassment: z.boolean(),
    }),
});

/**
 * Check if a message is safe using OpenRouter AI.
 * Returns a safety assessment with details if the message is flagged.
 */
export async function checkMessageSafety(
    text: string,
    context?: {
        recentMessages?: string[];
        pageKey?: string;
    },
): Promise<SafetyCheckResult> {
    if (!process.env.OPENROUTER_API_KEY) {
        // If no API key, allow the message through (fail open for local/dev)
        return { safe: true };
    }

    // Build context string from recent messages
    let contextStr = "";
    if (context?.recentMessages && context.recentMessages.length > 0) {
        contextStr = `\n\nRecent messages in this conversation:\n${context.recentMessages
            .slice(-5)
            .map((m, i) => `${i + 1}. ${m}`)
            .join("\n")}`;
    }

    try {
        const { object } = await generateObject({
            model: openrouter.chat("poolside/laguna-xs.2:free"),
            schema: SafetySchema,
            system: `You are a comment section content safety moderator. Analyze the message and context to determine if it violates safety policies.

The comment section is on a public, personal website.

Flag the message if it contains:
- Sexual content (explicit, suggestive, or inappropriate)
- Harmful content (promotes violence, self-harm, or dangerous activities)
- Abusive content (personal attacks, insults, aggressive language)
- Hate speech (discriminatory language against protected groups)
- Harassment (targeted bullying or unwanted attention)

Respond with ONLY the JSON object. Be strict about preventing harmful content.`,
            prompt: `Message to check: "${text}"${contextStr}

Respond with the safety assessment as JSON.`,
        });

        return {
            safe: object.safe,
            reason: object.reason,
            categories: object.categories,
        };
    } catch (error) {
        console.error("Safety check failed:", error);
        // Fail open - allow message if check fails
        return { safe: true };
    }
}
