// @ts-nocheck
import { Fragment } from 'react';
import PropTypes from 'prop-types';

export const For = ({ render, of }) =>
  of.map((item, index) => (
    <Fragment key={index}>{render(item, index)}</Fragment>
  ));

For.propTypes = {
  of: PropTypes.array.isRequired,
  render: PropTypes.func.isRequired,
};
