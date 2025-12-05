import { useEffect, useState } from 'react';

/**
 * Hook that handles terminal resize by clearing the screen
 * Returns current dimensions to trigger re-renders
 */
export function useResize(): { columns: number; rows: number } {
  const [dimensions, setDimensions] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  useEffect(() => {
    const handleResize = () => {
      // Clear the screen on resize to prevent artifacts
      process.stdout.write('\x1b[2J\x1b[H');

      setDimensions({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    };

    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return dimensions;
}
