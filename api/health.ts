import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return response.status(503).json({
        status: 'unhealthy',
        error: 'Missing Supabase configuration',
        timestamp: new Date().toISOString(),
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('stores')
      .select('count')
      .limit(1);

    if (error) {
      return response.status(503).json({
        status: 'unhealthy',
        error: 'Database connection failed',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return response.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return response.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
