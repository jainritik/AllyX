import { supabase } from "@/lib/supabase";
import { PostgrestError } from "@supabase/supabase-js";

/**
 * Represents the structure of the JSONB analysis column which tracks meeting/session data.
 */
export interface SessionAnalysis {
    job_description?: string;
    resume_name?: string;
    interview_type?: string; 
    language?: string;
    ai_responses?: string[];
    duration_minutes?: number;
    questions?: string[];
    model_used?: string;
}

/**
 * Enterprise-grade interface for a Database Record.
 * Represents a saved meeting/interview session from the backend.
 */
export interface Interview {
    id: string;
    user_id: string;
    title: string;
    transcript: string | null;
    analysis: SessionAnalysis | null;
    created_at: string;
}

/**
 * Custom App Error representing failed Service layer operations.
 */
export class InterviewServiceError extends Error {
    constructor(
        message: string,
        public readonly cause?: PostgrestError | Error | unknown
    ) {
        super(message);
        this.name = "InterviewServiceError";
    }
}

/**
 * Core Data Service layer for managing meeting transcripts and AI analysis.
 */
export const interviewService = {
    /**
     * Retrieves all saved sessions for the currently authenticated user.
     * @returns {Promise<Interview[]>} An array of meeting records.
     * @throws {InterviewServiceError} If authentication fails or database query errors.
     */
    getUserInterviews: async (): Promise<Interview[]> => {
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                throw new InterviewServiceError("User not authenticated", authError);
            }

            const { data, error } = await supabase
                .from('interviews')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                throw new InterviewServiceError("Failed to fetch meeting sessions", error);
            }
            
            return data as Interview[];
        } catch (error) {
            if (error instanceof InterviewServiceError) throw error;
            throw new InterviewServiceError("Unexpected error fetching sessions", error);
        }
    },

    /**
     * Persists a newly completed meeting session to the cloud dataset.
     * @param title The identifying title of the transaction.
     * @param transcript The raw STT transcription text.
     * @param analysis The structured SessionAnalysis payload.
     * @returns {Promise<Interview>} The newly created DB record.
     * @throws {InterviewServiceError}
     */
    saveInterview: async (
        title: string,
        transcript: string,
        analysis: SessionAnalysis,
        sessionId?: string
    ): Promise<Interview> => {
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                throw new InterviewServiceError("User not authenticated", authError);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            let data: Interview | null = null;
            let error: PostgrestError | null = null;
            try {
                const result = await supabase
                    .from('interviews')
                    .insert({
                        ...(sessionId ? { id: sessionId } : {}),
                        user_id: user.id,
                        title,
                        transcript,
                        analysis
                    })
                    .select()
                    .abortSignal(controller.signal)
                    .single();
                data = result.data as Interview | null;
                error = result.error;
            } finally {
                clearTimeout(timeout);
            }

            if (error?.code === '23505' && sessionId) {
                const { data: existing, error: readError } = await supabase
                    .from('interviews')
                    .select('*')
                    .eq('id', sessionId)
                    .eq('user_id', user.id)
                    .single();
                if (!readError && existing) return existing as Interview;
            }

            if (error) {
                throw new InterviewServiceError("Failed to save meeting session", error);
            }
            
            return data as Interview;
        } catch (error) {
            if (error instanceof InterviewServiceError) throw error;
            throw new InterviewServiceError("Unexpected error saving session", error);
        }
    },

    /**
     * Deletes a specific session ensuring RLS compliance and user ownership.
     * @param id The UUID of the record to delete.
     * @throws {InterviewServiceError}
     */
    deleteInterview: async (id: string): Promise<void> => {
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                throw new InterviewServiceError("User not authenticated", authError);
            }

            const { error } = await supabase
                .from('interviews')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id); // Strict ownership validation

            if (error) {
                throw new InterviewServiceError("Failed to delete meeting session", error);
            }
        } catch (error) {
            if (error instanceof InterviewServiceError) throw error;
            throw new InterviewServiceError("Unexpected error deleting session", error);
        }
    }
};
