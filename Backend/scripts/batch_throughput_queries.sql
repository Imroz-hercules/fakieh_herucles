/* ===================================================================
   Batch start, end and throughput -- the numbers behind the dashboard's
   24-Hour Production Performance card.

   RUN THESE ON SQL SERVER, NOT POSTGRES.
     server    DESKTOP-N8PGI9S\FAKIEH_REPORTING
     database  ASMBatchReports
     table     dbo.BatchMaterials_Shadow

   The Postgres database (Faikeh) holds silos, orders and trucks. Its
   production_batches table looks like the right thing and is not: it has
   no start or end timestamp, only created_at, and nothing writes to it.

   THREE THINGS TO KNOW BEFORE READING ANY RESULT
   -----------------------------------------------
   1. One row per MATERIAL, not per batch. A batch of feed is a dozen or
      more rows sharing one [Batch GUID]. Always GROUP BY it.

   2. [Quantity] is NOT the batch weight. It is a per-material lot size
      and genuinely differs between rows of the SAME batch. The weight
      actually made is SUM([Actual Value Float]) over the batch's rows.

   3. Timestamps are naive UTC. Plant time is +3 (Asia/Riyadh, no DST),
      and the plant's day runs 07:00 to 07:00 -- which is 04:00 UTC.
   =================================================================== */


/* -------------------------------------------------------------------
   1. EVERY BATCH IN THE LAST 24 HOURS
      start, end, how long it took, how much it made.
   ------------------------------------------------------------------- */
SELECT
    MIN([Batch Name])                                   AS batch_name,
    MIN([Product Name])                                 AS product,
    MIN([FormulaCategoryName])                          AS line,
    DATEADD(HOUR, 3, MIN([Batch Act Start]))            AS started_plant_time,
    DATEADD(HOUR, 3, MAX([Batch Act End]))              AS ended_plant_time,
    DATEDIFF(SECOND, MIN([Batch Act Start]), MAX([Batch Act End])) / 60.0
                                                        AS minutes,
    SUM(CAST([Actual Value Float] AS float)) / 1000.0   AS tonnes,
    COUNT(*)                                            AS material_rows
FROM [ASMBatchReports].[dbo].[BatchMaterials_Shadow]
WHERE LOWER(LTRIM(RTRIM([Product Name]))) <> 'not selected'
  AND [Product Name] IS NOT NULL
  AND LTRIM(RTRIM([Product Name])) <> ''
  AND [Batch Act Start] >= DATEADD(HOUR, -24, GETUTCDATE())
GROUP BY [Batch GUID]
ORDER BY MIN([Batch Act Start]);
/* Look at the start times. Several batches share one to the second: that
   stamp is when the batching system RELEASED the batch, not when dosing
   began, which is why batches overlap and why per-batch rates below are
   not the plant's rate. */


/* -------------------------------------------------------------------
   2. THE TOTALS -- what the card's four figures are built from
      (everything except Efficiency, which needs query 3)
   ------------------------------------------------------------------- */
SELECT
    COUNT(DISTINCT [Batch GUID])                        AS batches,
    DATEADD(HOUR, 3, MIN([Batch Act Start]))            AS first_batch_start,
    DATEADD(HOUR, 3, MAX([Batch Act End]))              AS last_batch_end,
    SUM(CAST([Actual Value Float] AS float)) / 1000.0   AS tonnes,
    SUM(CAST([Actual Value Float] AS float)) / 1000.0 / 24.0
                                                        AS tonnes_per_hour_over_24h
FROM [ASMBatchReports].[dbo].[BatchMaterials_Shadow]
WHERE LOWER(LTRIM(RTRIM([Product Name]))) <> 'not selected'
  AND [Product Name] IS NOT NULL
  AND LTRIM(RTRIM([Product Name])) <> ''
  AND [FormulaCategoryName] <> 'OutLoading'   -- feed leaving on a truck,
  AND [Batch Act Start] >= DATEADD(HOUR, -24, GETUTCDATE());
/* OutLoading is excluded because it is feed the mill already reported
   making; counting it here would book the same tonnage twice. The card
   reports it separately for the same reason. */


/* -------------------------------------------------------------------
   3. EFFICIENCY -- running time as a share of the window
      This is the one worth understanding.

      Batches OVERLAP, so adding their durations counts the same minute
      more than once: on a real day that gives ~55 h inside a 24 h day.
      What is wanted is the time AT LEAST ONE batch was open -- the union
      of the intervals, merged. Below is the standard gaps-and-islands
      solution, and it is what the card computes in Python.
   ------------------------------------------------------------------- */
WITH batch AS (
    SELECT [Batch GUID]              AS guid,
           MIN([Batch Act Start])    AS s,
           MAX([Batch Act End])      AS e
    FROM [ASMBatchReports].[dbo].[BatchMaterials_Shadow]
    WHERE LOWER(LTRIM(RTRIM([Product Name]))) <> 'not selected'
      AND [Product Name] IS NOT NULL
      AND LTRIM(RTRIM([Product Name])) <> ''
      AND [FormulaCategoryName] <> 'OutLoading'
      AND [Batch Act Start] >= DATEADD(HOUR, -24, GETUTCDATE())
    GROUP BY [Batch GUID]
    HAVING MAX([Batch Act End]) > MIN([Batch Act Start])   -- drop clock skew
),
marked AS (
    /* A batch opens a new island when it starts after every batch before
       it has already finished. */
    SELECT s, e,
           CASE WHEN MAX(e) OVER (ORDER BY s
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) >= s
                THEN 0 ELSE 1 END AS starts_island
    FROM batch
),
islands AS (
    SELECT s, e,
           SUM(starts_island) OVER (ORDER BY s ROWS UNBOUNDED PRECEDING) AS island
    FROM marked
),
merged AS (
    SELECT island, MIN(s) AS island_start, MAX(e) AS island_end
    FROM islands
    GROUP BY island
)
SELECT
    COUNT(*)                                                       AS running_blocks,
    SUM(DATEDIFF(SECOND, island_start, island_end)) / 3600.0       AS running_hours,
    24.0 - SUM(DATEDIFF(SECOND, island_start, island_end)) / 3600.0 AS idle_hours,
    SUM(DATEDIFF(SECOND, island_start, island_end)) / 3600.0 / 24.0 * 100.0
                                                                   AS efficiency_pct
FROM merged;
/* running_hours is also the divisor for the card's headline throughput:
       tonnes (query 2) / running_hours = t/h while actually producing.

   WHY THIS CAN DIFFER FROM THE CARD BY A FEW MINUTES
   ---------------------------------------------------
   These queries select on [Batch Act Start] alone, because that is what
   reads clearly in a query window. The card is stricter at the edges: it
   also picks up a batch that was already running when the window opened,
   and it CLIPS every batch to the window instead of counting the part
   that falls outside it.

   On the captured extract, this query gives 21.87 running hours for a day
   the card reports as 21.37 -- a half hour, all of it at the two edges.
   Neither is wrong; they answer slightly different questions. Over a whole
   production day the difference is small, and it disappears entirely on a
   window where nothing straddles either edge.

   The merging itself is the same: replayed against the extract, the
   islands below produce 5 blocks and 21.8728 hours, matching the card's
   merge_intervals() exactly. */


/* -------------------------------------------------------------------
   4. THE MERGED RUNNING BLOCKS THEMSELVES
      The same islands, listed -- this is the striped ribbon on the card.
      Swap the final SELECT of query 3 for this one:

        SELECT DATEADD(HOUR, 3, island_start) AS ran_from_plant_time,
               DATEADD(HOUR, 3, island_end)   AS ran_to_plant_time,
               DATEDIFF(MINUTE, island_start, island_end) AS minutes
        FROM merged
        ORDER BY island_start;

      The gaps between consecutive rows are the plant's idle stretches.
   ------------------------------------------------------------------- */


/* -------------------------------------------------------------------
   CHANGING THE WINDOW
     last 24 hours     [Batch Act Start] >= DATEADD(HOUR, -24, GETUTCDATE())
     one production day, e.g. 9 Sep plant time:
                       [Batch Act Start] >= '2026-09-09 04:00'
                   AND [Batch Act Start] <  '2026-09-10 04:00'
     (07:00 plant time is 04:00 UTC. Divide by the window's own length in
      query 3 rather than 24 if you change it.)
   ------------------------------------------------------------------- */
