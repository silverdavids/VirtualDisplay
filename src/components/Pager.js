import React from "react";
import ReactPaginate from "react-paginate";

const Pager = ({ page, totalPages }) => {
  return <nav className="d-flex flex-row justify-content-center text-success">
    <ReactPaginate
      className="pagination rounded-sm"
      pageClassName="page-item"
      pageLinkClassName="page-link text-success"
      activeClassName="fw-bold active"
      activeLinkClassName="bg-success border-success text-white"
      forcePage={--page}
      breakLabel=""
      nextLabel=""
      previousLabel=""
      onPageChange={(evt) => console.log(evt)}
      pageRangeDisplayed={5}
      pageCount={totalPages}
      renderOnZeroPageCount={null}
    />
  </nav>
};

export default Pager;
