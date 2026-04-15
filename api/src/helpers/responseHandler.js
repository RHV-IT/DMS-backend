const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const created = (res, data, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'Error', statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

const paginated = (res, data, page, limit, total) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      currentPage: parseInt(page),
      itemsPerPage: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      total
    }
  });
};

module.exports = {
  success,
  created,
  error,
  paginated
};