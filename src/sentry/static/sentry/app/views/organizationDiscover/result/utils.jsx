/*eslint no-use-before-define: ["error", { "functions": false }]*/

import React from 'react';
import styled from 'react-emotion';
import moment from 'moment';
import {orderBy} from 'lodash';

import {NUMBER_OF_SERIES_BY_DAY} from '../data';

const CHART_KEY = '__CHART_KEY__';

/**
 * Returns data formatted for basic line and bar charts, with each aggregation
 * representing a series.
 *
 * @param {Array} data Data returned from Snuba
 * @param {Object} query Query state corresponding to data
 * @returns {Array}
 */
export function getChartData(data, query) {
  const {fields} = query;

  return query.aggregations.map(aggregation => {
    return {
      seriesName: aggregation[2],
      data: data.map(res => {
        return {
          value: res[aggregation[2]],
          name: fields.map(field => `${field} ${res[field]}`).join(' '),
        };
      }),
    };
  });
}

/**
 * Returns time series data formatted for line and bar charts, with each day
 * along the x-axis
 *
 * @param {Array} data Data returned from Snuba
 * @param {Object} query Query state corresponding to data
 * @returns {Array}
 */
export function getChartDataByDay(rawData, query) {
  // We only chart the first aggregation for now
  const aggregate = query.aggregations[0][2];

  const data = getDataWithKeys(rawData, query);

  // We only want to show the top 10 series
  const top10Series = getTopSeries(data, aggregate);

  const dates = [...new Set(rawData.map(entry => formatDate(entry.time)))];

  // Temporarily store series as object with series names as keys
  const seriesHash = getEmptySeriesHash(top10Series, dates);

  // Insert data into series if it's in a top 10 series
  data.forEach(row => {
    const key = row[CHART_KEY];

    const dateIdx = dates.indexOf(formatDate(row.time));

    if (top10Series.has(key)) {
      seriesHash[key][dateIdx].value = row[aggregate];
    }
  });

  // Format for echarts
  return Object.entries(seriesHash).map(([seriesName, series]) => {
    return {
      seriesName,
      data: series,
    };
  });
}

// Return placeholder empty series object with all series and dates listed and
// all values set to null
function getEmptySeriesHash(seriesSet, dates) {
  const output = {};

  [...seriesSet].forEach(series => {
    output[series] = getEmptySeries(dates);
  });

  return output;
}

function getEmptySeries(dates) {
  return dates.map(date => {
    return {
      value: null,
      name: date,
    };
  });
}

// Get the top series ranked by latest time / largest aggregate
function getTopSeries(data, aggregate) {
  const allData = orderBy(data, ['time', aggregate], ['desc', 'desc']);

  return new Set(
    [...new Set(allData.map(row => row[CHART_KEY]))].slice(0, NUMBER_OF_SERIES_BY_DAY)
  );
}

function getDataWithKeys(data, query) {
  const {aggregations, fields} = query;
  // We only chart the first aggregation for now
  const aggregate = aggregations[0][2];

  return data.map(row => {
    const key = fields.length
      ? fields.map(field => getLabel(row[field])).join(',')
      : aggregate;

    return {
      ...row,
      [CHART_KEY]: key,
    };
  });
}

function formatDate(datetime) {
  return moment.utc(datetime * 1000).format('MMM Do');
}

export function formatTooltip(seriesParams) {
  const label = seriesParams.length && seriesParams[0].axisValueLabel;
  return [
    `<div>${truncateLabel(label)}</div>`,
    seriesParams
      .filter(s => s.data[1] !== null)
      .map(s => `<div>${s.marker} ${truncateLabel(s.seriesName)}:  ${s.data[1]}</div>`)
      .join(''),
  ].join('');
}

// Truncates labels for tooltip
function truncateLabel(seriesName) {
  let result = seriesName;
  if (seriesName.length > 80) {
    result = seriesName.substring(0, 80) + '…';
  }
  return result;
}

// Converts a value to a string for the chart label. This could
// potentially cause incorrect grouping, e.g. if the value null and string
// 'null' are both present in the same series they will be merged into 1 value
function getLabel(value) {
  if (typeof value === 'object') {
    try {
      value = JSON.stringify(value);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  return value;
}

/**
 * Takes any value and returns a display version of that value for
 * rendering in the "discover" result table. Handles only the 3 types
 * that we would expect to be present in Snuba data - string, null and array
 */
export function getDisplayValue(val, idx) {
  if (typeof val === 'string') {
    return <DarkGray key={idx}>{`"${val}"`}</DarkGray>;
  }

  if (val === null) {
    return <LightGray key={idx}>null</LightGray>;
  }

  if (Array.isArray(val)) {
    return (
      <span>
        [
        {val.map(getDisplayValue).reduce((acc, curr, arrayIdx) => {
          if (arrayIdx !== 0) {
            return [...acc, ',', curr];
          }
          return [...acc, curr];
        }, [])}
        ]
      </span>
    );
  }

  return val;
}

export function getDisplayText(val) {
  if (typeof val === 'string') {
    return `"${val}"`;
  }

  if (val === null) {
    return 'null';
  }

  if (Array.isArray(val)) {
    return `[
        ${val.map(getDisplayValue).reduce((acc, curr, arrayIdx) => {
          if (arrayIdx !== 0) {
            return [...acc, ',', curr];
          }
          return [...acc, curr];
        }, [])}
        ]`;
  }

  return val;
}

const LightGray = styled.span`
  color: ${p => p.theme.gray1};
`;

const DarkGray = styled.span`
  color: ${p => p.theme.gray5};
`;
