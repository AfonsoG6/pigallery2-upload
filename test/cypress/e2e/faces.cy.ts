describe('Faces', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('.card-body');
    cy.get('.col-sm-12').contains('Login');
    /* ==== Generated with Cypress Studio ==== */
    cy.get('#username').type('admin');
    cy.get('#password').clear();
    cy.get('#password').type('admin');
    cy.intercept({
      method: 'Get',
      url: '/pgapi/person',
    }).as('getPerson');
    cy.get('.col-sm-12 > .btn').click();
    cy.get('nav .nav-item .nav-link').contains('Faces').click();
  });
  it('Show faces', () => {
    cy.wait('@getPerson', {timeout: 10000});
    // contains a folder
    cy.get('app-face  a > .info').contains('Alvin the Squirrel').should('exist');
  });
  it('Faces should have photos', () => {
    cy.wait('@getPerson', {timeout: 10000});
    // should have a photo
    cy.get('app-face .photo-container .photo', {timeout: 10000}).should('exist');
  });

});
